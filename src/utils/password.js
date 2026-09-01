const crypto = require("node:crypto");

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash || "").split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }

    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      const expected = Buffer.from(key, "hex");
      const actual = Buffer.from(derivedKey.toString("hex"), "hex");
      resolve(expected.length === actual.length && crypto.timingSafeEqual(expected, actual));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
