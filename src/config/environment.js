// Read local files and paths.
const fs = require("node:fs");
const path = require("node:path");

// Load values from .env without adding another package.
function loadLocalEnvironment(filePath = path.resolve(process.cwd(), ".env")) {
  // Keep startup working when a developer has not created a local .env file.
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");

  // Read the file one line at a time.
  for (const line of contents.split(/\r?\n/)) {
    // Remove spaces before checking whether this line contains a setting.
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Find the separator between the key and the value.
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      // Ignore lines that are not written as KEY=value.
      continue;
    }

    // Clean the key and value before using them.
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(["'])(.*)\1$/, "$2");

    // Keep real environment variables more important than .env values.
    if (key && process.env[key] === undefined) {
      // Set only missing values so shell variables keep priority.
      process.env[key] = value;
    }
  }
}

loadLocalEnvironment();

// Keep all application settings in one read-only object.
const config = Object.freeze({
  appName: "The Daily Web",
  // Detect production so authentication cookies can require HTTPS.
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || "",
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 10080),
  // Keep the session cookie name configurable without changing source code.
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "daily_web_session",
  weatherApiUrl: process.env.WEATHER_API_URL || "",
  weatherLatitude: Number(process.env.WEATHER_LATITUDE || 31.7683),
  weatherLongitude: Number(process.env.WEATHER_LONGITUDE || 35.2137),
  weatherTimezone: process.env.WEATHER_TIMEZONE || "Asia/Jerusalem",
  // Reuse weather results for fifteen minutes unless the environment overrides it.
  weatherCacheMinutes: Number(process.env.WEATHER_CACHE_MINUTES || 15),
  seedPassword: process.env.SEED_PASSWORD || ""
});

module.exports = config;
