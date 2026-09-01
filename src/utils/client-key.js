// Load the built-in hashing tool used for anonymous client identifiers.
const crypto = require("node:crypto");

// Hash a client key before it is stored in MongoDB.
function hashClientKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = { hashClientKey };
