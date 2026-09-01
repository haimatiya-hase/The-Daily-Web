// Load the built-in hashing tool used for anonymous client identifiers.
const crypto = require("node:crypto");

// Hash a client key before it is stored in MongoDB.
function hashClientKey(value) {
  // Store a stable anonymous identifier without saving the original key.
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = { hashClientKey };
