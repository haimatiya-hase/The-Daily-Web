// Load Node's cryptography module for unpredictable tokens and one-way hashing.
const crypto = require("node:crypto");
// Load centralized environment settings for cookie names and session lifetime.
const config = require("../config/environment");
// Load the persistent MongoDB session model.
const Session = require("../models/session.model");

// Convert a private browser token into the hash stored in MongoDB.
function hashToken(token) {
  // SHA-256 lets the server find a session without storing the usable token itself.
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

// Read the configured session cookie without adding another dependency.
function readSessionToken(req) {
  // Convert the optional Cookie header to a safe string.
  const cookieHeader = String(req.headers.cookie || "");
  // Examine each semicolon-separated cookie sent by the browser.
  for (const item of cookieHeader.split(";")) {
    // Locate the first equals sign that separates a cookie name from its value.
    const separator = item.indexOf("=");
    // Ignore malformed cookie fragments that do not contain a value.
    if (separator === -1) continue;
    // Remove surrounding whitespace from the cookie name.
    const name = item.slice(0, separator).trim();
    // Select only the cookie configured for this application's sessions.
    if (name === config.sessionCookieName) {
      // Read the raw value before attempting to decode escaped characters.
      const rawValue = item.slice(separator + 1).trim();
      try {
        // Decode escaped characters before returning the original random token.
        return decodeURIComponent(rawValue);
      } catch (error) {
        // Ignore a malformed cookie instead of failing the whole request.
        return null;
      }
    }
  }
  // Treat requests without the session cookie as guest requests.
  return null;
}

// Create a persistent server-side session for one authenticated user.
async function createSession(userId) {
  // Generate 256 bits of randomness so attackers cannot guess valid tokens.
  const token = crypto.randomBytes(32).toString("base64url");
  // Calculate the expiry time from the configured session lifetime.
  const expiresAt = new Date(Date.now() + config.sessionTtlMinutes * 60 * 1000);
  // Store the token hash, user relation, and expiry date in MongoDB.
  await Session.create({ tokenHash: hashToken(token), user: userId, expiresAt });
  // Return the unhashed token only once so it can be placed in the browser cookie.
  return token;
}

// Resolve a browser token into the user represented by a valid session.
async function findSessionUser(token) {
  // Query by token hash and reject sessions that have already expired.
  const session = await Session.findOne({
    // Match the one-way hash rather than storing or querying the original token.
    tokenHash: hashToken(token),
    // Require an expiry date later than the current time.
    expiresAt: { $gt: new Date() }
  // Replace the stored user id with the corresponding User document.
  }).populate("user");
  // Return the populated user, or null when no valid session exists.
  return session && session.user ? session.user : null;
}

// Delete the current session during logout.
async function destroySession(token) {
  // Skip the database operation when the request did not contain a token.
  if (token) {
    // Delete only the document matching the submitted token hash.
    await Session.deleteOne({ tokenHash: hashToken(token) });
  }
}

// Build one consistent security policy for setting and clearing the cookie.
function cookieOptions() {
  // Return Express cookie settings that protect the authentication token.
  return {
    // Prevent browser JavaScript from reading the session token.
    httpOnly: true,
    // Reduce cross-site request attacks while preserving normal navigation.
    sameSite: "lax",
    // Require HTTPS cookies in production while allowing local HTTP development.
    secure: config.nodeEnv === "production",
    // Keep the browser lifetime aligned with the MongoDB session lifetime.
    maxAge: config.sessionTtlMinutes * 60 * 1000,
    // Send the cookie to every route in this application.
    path: "/"
  };
}

// Store the new session token in the browser after successful authentication.
function setSessionCookie(res, token) {
  // Use Express to serialize the token with the shared security settings.
  res.cookie(config.sessionCookieName, token, cookieOptions());
}

// Remove the browser token after logout.
function clearSessionCookie(res) {
  // Start with the same options used when the cookie was created.
  const options = cookieOptions();
  // Remove maxAge because clearCookie writes an immediately expired cookie.
  delete options.maxAge;
  // Clear the exact cookie name and path used during login.
  res.clearCookie(config.sessionCookieName, options);
}

// Export the helpers used by controllers, middleware, and focused unit tests.
module.exports = {
  hashToken,
  readSessionToken,
  createSession,
  findSessionUser,
  destroySession,
  setSessionCookie,
  clearSessionCookie
};
