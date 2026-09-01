// Read the selected weather service settings.
const config = require("../config/environment");

// Request current weather without exposing a server secret to the browser.
async function getWeather() {
  if (!config.weatherApiUrl) {
    return null;
  }

  const url = new URL(config.weatherApiUrl);
  url.searchParams.set("latitude", String(config.weatherLatitude));
  url.searchParams.set("longitude", String(config.weatherLongitude));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", config.weatherTimezone);

  // Stop waiting if the external service is slow.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    // Use the native fetch API available in modern Node.js.
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Weather service returned ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getWeather };
