// Use Node's built-in cryptography instead of adding a password package.
const crypto = require("node:crypto");

// Create a salted password hash that cannot reveal the original password.
function hashPassword(password) {
  // Use a Promise so the asynchronous scrypt callback is easy to await.
  return new Promise((resolve, reject) => {
    // Give every password a different random salt.
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        // Let the caller handle cryptography failures.
        reject(error);
        return;
      }
      // Store the salt beside the derived key for later verification.
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

// Compare a login password with a stored hash.
function verifyPassword(password, storedHash) {
  // Use the same asynchronous hashing method used during registration.
  return new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash || "").split(":");
    if (!salt || !key) {
      // Reject missing or malformed stored values without throwing.
      resolve(false);
      return;
    }

    // Derive the same key from the submitted password.
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        // Let the caller handle a failed password derivation.
        reject(error);
        return;
      }

      // Use a timing-safe comparison to reduce timing attacks.
      const expected = Buffer.from(key, "hex");
      const actual = Buffer.from(derivedKey.toString("hex"), "hex");
      resolve(expected.length === actual.length && crypto.timingSafeEqual(expected, actual));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
