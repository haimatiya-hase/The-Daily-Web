// Use Node's built-in cryptography instead of adding a password package.
const crypto = require("node:crypto");

// Create a salted password hash that cannot reveal the original password.
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    // Give every password a different random salt.
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
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
  return new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash || "").split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }

    // Derive the same key from the submitted password.
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
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
