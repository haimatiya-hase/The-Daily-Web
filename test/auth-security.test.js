// Load Node's built-in test runner without adding another dependency.
const test = require("node:test");
// Load strict assertions so every expected security result is explicit.
const assert = require("node:assert/strict");
// Load helpers that create and verify salted password hashes.
const { hashPassword, verifyPassword } = require("../src/utils/password");
// Load session helpers that can be tested without a live MongoDB server.
const { hashToken, readSessionToken } = require("../src/services/session.service");

// Verify that equal passwords receive different random salts.
test("passwords are salted and can be verified", async () => {
  // Hash the sample password with a new random salt.
  const first = await hashPassword("correct horse battery staple");
  // Hash the same password again with another random salt.
  const second = await hashPassword("correct horse battery staple");
  // Confirm that equal passwords do not create equal database values.
  assert.notEqual(first, second);
  // Confirm that the correct password matches its stored hash.
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  // Confirm that an incorrect password is rejected.
  assert.equal(await verifyPassword("wrong password", first), false);
});

// Verify that MongoDB stores a one-way hash instead of the usable token.
test("session tokens use deterministic one-way hashes", () => {
  // Use a fixed token so the expected result can be repeated.
  const token = "private-session-token";
  // Confirm that the database value differs from the private browser token.
  assert.notEqual(hashToken(token), token);
  // Confirm that the same token always finds the same session hash.
  assert.equal(hashToken(token), hashToken(token));
});

// Verify that only the configured authentication cookie is selected.
test("session token is read from the authentication cookie", () => {
  // Create a minimal request with an unrelated cookie and an encoded session value.
  const req = { headers: { cookie: "theme=dark; daily_web_session=abc%20123" } };
  // Confirm that encoded characters are decoded before the token is used.
  assert.equal(readSessionToken(req), "abc 123");
  // Confirm that requests without cookies remain unauthenticated guests.
  assert.equal(readSessionToken({ headers: {} }), null);
});

// Verify that malformed cookie encoding is treated as an unauthenticated request.
test("malformed session cookies do not crash cookie parsing", () => {
  // Send an invalid percent escape through the session cookie header.
  const req = { headers: { cookie: "daily_web_session=%not-a-valid-escape" } };
  // Confirm that the malformed value is ignored safely.
  assert.equal(readSessionToken(req), null);
});
