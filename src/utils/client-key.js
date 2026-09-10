// Load the built-in hashing and random helpers used for anonymous device identifiers.
const crypto = require("node:crypto");

// Name the first-party cookie that identifies an anonymous device across visits.
const DEVICE_COOKIE_NAME = "dailyWebDeviceKey";
// Keep the device cookie for one year so view statistics stay consistent for returning readers.
const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
// Never accept a device key longer than this from any source.
const MAX_KEY_LENGTH = 100;

// Hash a client key before it is stored in MongoDB.
function hashClientKey(value) {
  // Store a stable anonymous identifier without saving the original key.
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

// Read one cookie value from the raw Cookie header without an extra dependency.
const readCookie = (req, name) => {
  // Examine each semicolon-separated cookie sent by the browser.
  for (const part of String(req.headers?.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    // Ignore malformed fragments that do not contain a value.
    if (separator === -1) continue;
    // Match only the requested cookie name.
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      // Decode the value safely and ignore a malformed encoding.
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch (error) {
      return "";
    }
  }

  return "";
};

// Create a new random device key for a browser that has none yet.
const createDeviceKey = () => crypto.randomUUID();

// Return the device key cookie of this browser, creating and sending it when missing.
const ensureDeviceKey = (req, res) => {
  // Reuse the existing cookie so every visit of one browser shares one key.
  const existing = readCookie(req, DEVICE_COOKIE_NAME).slice(0, MAX_KEY_LENGTH);
  if (existing) {
    return existing;
  }

  // Send a fresh anonymous key; it is not HttpOnly because the page syncs it into localStorage.
  const key = createDeviceKey();
  res.cookie(DEVICE_COOKIE_NAME, key, {
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    sameSite: "lax",
    httpOnly: false,
    secure: Boolean(req.secure),
    path: "/"
  });

  return key;
};

// Identify the requesting device with the header, then the cookie, then a network fallback.
const readClientKey = (req) => {
  // Prefer the anonymous localStorage key that browser scripts send in a header.
  const headerKey = String(req.get?.("X-Client-Key") || "").trim().slice(0, MAX_KEY_LENGTH);
  if (headerKey) {
    return headerKey;
  }

  // Fall back to the device cookie set by the article page.
  const cookieKey = readCookie(req, DEVICE_COOKIE_NAME).slice(0, MAX_KEY_LENGTH);
  if (cookieKey) {
    return cookieKey;
  }

  // Fall back to the request address so rate limits still work without browser storage.
  return `ip:${req.ip || "unknown"}`;
};

module.exports = { DEVICE_COOKIE_NAME, hashClientKey, readCookie, createDeviceKey, ensureDeviceKey, readClientKey };
