const config = require("../config/environment");

async function getWeather() {
  if (!config.weatherApiUrl) {
    return null;
  }

  const url = new URL(config.weatherApiUrl);
  url.searchParams.set("latitude", String(config.weatherLatitude));
  url.searchParams.set("longitude", String(config.weatherLongitude));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", config.weatherTimezone);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
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
