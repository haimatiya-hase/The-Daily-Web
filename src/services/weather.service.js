// Read the selected weather service settings.
const config = require("../config/environment");

// Keep the last successful response in server memory to avoid unnecessary requests.
let cachedWeather = null;
// Remember when the cached response was received so freshness can be checked.
let cachedAt = 0;

// Build the external service URL from explicit weather settings.
function buildWeatherUrl({ serviceUrl, latitude, longitude, timezone }) {
  // Parse the configured service address with the standard URL class.
  const url = new URL(serviceUrl);
  // Request weather for the configured latitude.
  url.searchParams.set("latitude", String(latitude));
  // Request weather for the configured longitude.
  url.searchParams.set("longitude", String(longitude));
  // Request only the current values required by the widget.
  url.searchParams.set("current", "temperature_2m,weather_code");
  // Ask the service to return timestamps in the configured timezone.
  url.searchParams.set("timezone", timezone);
  // Return the complete URL for the external request.
  return url;
}

// Check whether the stored weather result is still inside the cache window.
function hasFreshCache(now, cacheTtlMs) {
  // Require stored data and an age smaller than the configured lifetime.
  return cachedWeather !== null && now - cachedAt < cacheTtlMs;
}

// Request current weather without exposing the external service directly to browsers.
async function getWeather(options = {}) {
  // Use an explicit service URL during tests or the configured URL during normal requests.
  const serviceUrl = options.serviceUrl ?? config.weatherApiUrl;
  // Use an explicit latitude during tests or the configured location by default.
  const latitude = options.latitude ?? config.weatherLatitude;
  // Use an explicit longitude during tests or the configured location by default.
  const longitude = options.longitude ?? config.weatherLongitude;
  // Use an explicit timezone during tests or the configured timezone by default.
  const timezone = options.timezone ?? config.weatherTimezone;
  // Use an injected fetch function during tests or Node's native fetch in production.
  const fetchImpl = options.fetchImpl ?? fetch;
  // Use an injected clock during tests or the real current time in production.
  const now = options.now ?? Date.now();
  // Convert the configured cache duration from minutes to milliseconds.
  const cacheTtlMs = options.cacheTtlMs ?? config.weatherCacheMinutes * 60 * 1000;

  // Return null when no external weather service was configured.
  if (!serviceUrl) {
    return null;
  }

  // Reuse fresh data instead of calling the external service again.
  if (hasFreshCache(now, cacheTtlMs)) {
    return cachedWeather;
  }

  // Build the external request URL from the selected settings.
  const url = buildWeatherUrl({ serviceUrl, latitude, longitude, timezone });

  // Stop waiting if the external service is slow.
  const controller = new AbortController();
  // Abort the external request after four seconds.
  const timeout = setTimeout(() => controller.abort(), 4000);

  // Always clear the timeout after the request finishes or fails.
  try {
    // Use the native fetch API available in modern Node.js.
    const response = await fetchImpl(url, { signal: controller.signal });
    // Reject unsuccessful HTTP status codes returned by the service.
    if (!response.ok) {
      throw new Error(`Weather service returned ${response.status}`);
    }
    // Parse the successful JSON response.
    const weather = await response.json();
    // Save the successful response for later requests.
    cachedWeather = weather;
    // Save the request time so the fifteen-minute window can be measured.
    cachedAt = now;
    // Return the fresh weather result to the caller.
    return weather;
  // Handle external service failures without showing data outside the allowed freshness window.
  } catch (error) {
    // Keep the last result only while it is still inside the fifteen-minute limit.
    if (cachedWeather !== null && now - cachedAt < cacheTtlMs) {
      return cachedWeather;
    }
    // Re-throw the failure when no fresh result is available.
    throw error;
  } finally {
    // Prevent the timeout from remaining active after the request completes.
    clearTimeout(timeout);
  }
}

// Clear module cache state so automated tests remain independent.
function resetWeatherCache() {
  // Remove the last successful weather response.
  cachedWeather = null;
  // Reset the saved timestamp to its initial value.
  cachedAt = 0;
}

// Export the service and focused helpers used by automated tests.
module.exports = { getWeather, buildWeatherUrl, resetWeatherCache };
