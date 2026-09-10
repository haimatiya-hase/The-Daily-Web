const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const { DEVICE_COOKIE_NAME, readCookie, readClientKey, ensureDeviceKey } = require("../src/utils/client-key"); // Load the device identification helpers.

test("cookies are read by name from the raw header", () => { // Verify the dependency-free cookie reader.
  const req = { headers: { cookie: `session=abc; ${DEVICE_COOKIE_NAME}=key%20one; other=2` } }; // Build a header with three cookies.
  assert.equal(readCookie(req, DEVICE_COOKIE_NAME), "key one"); // Confirm the value is decoded.
  assert.equal(readCookie(req, "missing"), ""); // Confirm a missing cookie is empty.
  assert.equal(readCookie({ headers: {} }, DEVICE_COOKIE_NAME), ""); // Confirm no header is handled.
});

test("the device key prefers the header, then the cookie, then the address", () => { // Verify the identification order.
  const withHeader = { get: () => "header-key", headers: { cookie: `${DEVICE_COOKIE_NAME}=cookie-key` }, ip: "1.1.1.1" };
  const withCookie = { get: () => "", headers: { cookie: `${DEVICE_COOKIE_NAME}=cookie-key` }, ip: "1.1.1.1" };
  const withNothing = { get: () => "", headers: {}, ip: "1.1.1.1" };
  assert.equal(readClientKey(withHeader), "header-key"); // Confirm browser scripts win.
  assert.equal(readClientKey(withCookie), "cookie-key"); // Confirm the cookie is used for plain page loads.
  assert.equal(readClientKey(withNothing), "ip:1.1.1.1"); // Confirm the network fallback.
});

test("the device cookie is reused when present and created once when missing", () => { // Verify one key per browser.
  const existing = { headers: { cookie: `${DEVICE_COOKIE_NAME}=already-there` }, secure: false }; // Simulate a returning browser.
  let setCookie = null; // Record a cookie sent to the browser.
  const res = { cookie(name, value, options) { setCookie = { name, value, options }; } }; // Simulate the Express response.

  assert.equal(ensureDeviceKey(existing, res), "already-there"); // Confirm the existing key is reused.
  assert.equal(setCookie, null); // Confirm no new cookie was sent.

  const fresh = { headers: {}, secure: true }; // Simulate a first visit over HTTPS.
  const key = ensureDeviceKey(fresh, res);
  assert.equal(setCookie.name, DEVICE_COOKIE_NAME); // Confirm the cookie name.
  assert.equal(setCookie.value, key); // Confirm the returned key is the one sent.
  assert.equal(setCookie.options.sameSite, "lax"); // Confirm the cookie stays first-party.
  assert.equal(setCookie.options.httpOnly, false); // Confirm the page can sync it into localStorage.
  assert.equal(setCookie.options.secure, true); // Confirm HTTPS requests get a secure cookie.
  assert.equal(setCookie.options.path, "/"); // Confirm the cookie covers the whole site.
});
