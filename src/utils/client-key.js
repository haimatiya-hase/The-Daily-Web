// Load the built-in hashing tool used for anonymous client identifiers.
const crypto = require("node:crypto");

// Hash a client key before it is stored in MongoDB.
function hashClientKey(value) {
  // Store a stable anonymous identifier without saving the original key.
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

// Identify the requesting device with the anonymous browser key or a network fallback.
const readClientKey = (req) => {
  // Prefer the anonymous localStorage key that the browser sends in a header.
  const headerKey = String(req.get?.("X-Client-Key") || "").trim().slice(0, 100);
  // Fall back to the request address so rate limits still work without browser storage.
  return headerKey || `ip:${req.ip || "unknown"}`;
};

module.exports = { hashClientKey, readClientKey };
