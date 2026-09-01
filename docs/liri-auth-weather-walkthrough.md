# Liri: authentication, users, security, and weather

This page explains Liri's project area in simple English for the project defense.

## Request flow

1. `src/app.js` reads the private session cookie before protected routes run.
2. `src/services/session.service.js` hashes the token and finds its MongoDB session.
3. `src/middleware/auth.middleware.js` places the connected user on `req.user`.
4. `requireRole` compares the stored user role with the role allowed by the route.
5. The controller renders the correct page only after the server permission check passes.

## Login and logout

- `src/controllers/auth.controller.js` normalizes the submitted username.
- The controller selects `passwordHash` explicitly because the model hides it by default.
- `src/utils/password.js` uses `crypto.scrypt` with a random salt.
- A failed login always returns the same message, so it does not reveal whether a username exists.
- A successful login creates a random token, but MongoDB stores only the token hash.
- The browser receives the token in an `HttpOnly` cookie, so normal browser JavaScript cannot read it.
- Logout deletes the matching MongoDB session and clears the browser cookie.

## Users and roles

- A guest is a visitor without a saved database user or valid session.
- A reporter is allowed to enter only the reporter workspace.
- An editor is allowed to enter only the editor workspace.
- `src/models/user.model.js` accepts only `reporter` and `editor` as stored roles.
- The server returns status `401` when login is required.
- The server returns status `403` when a connected user has the wrong role.
- The user model removes `passwordHash` whenever a user is converted to JSON.

## Persistent sessions

- `src/models/session.model.js` stores the token hash, user reference, and expiry date.
- The TTL index lets MongoDB remove expired sessions automatically.
- The session remains in MongoDB after a Node.js server restart.
- `SameSite=Lax` reduces cross-site request risks.
- `Secure` is enabled in production so the cookie travels only through HTTPS.

## Weather widget

- `src/services/weather.service.js` calls the configured external weather service.
- The service requests only temperature and weather code for the configured location.
- A successful response is cached in server memory for up to 15 minutes.
- Repeated requests inside that window reuse the cache instead of calling the service again.
- The service keeps the last successful response as a fallback after a temporary failure.
- `GET /api/weather` returns only the small set of values required by the browser.
- `public/js/home.js` converts weather codes into short readable descriptions.
- The widget shows a safe unavailable message instead of technical error details.

## Questions the instructor may ask

### Why do we hash passwords?

A password hash is one-way. If the database leaks, the original password is not stored as readable text.

### Why do we use a salt?

A random salt makes equal passwords produce different stored hashes and makes precomputed attacks harder.

### Why is the session token hashed in MongoDB?

The usable token stays only in the protected browser cookie. A leaked database value cannot be used directly as that cookie.

### What is the difference between 401 and 403?

`401` means the visitor must log in. `403` means the user is logged in but does not have permission.

### Why are permissions checked on the server?

Browser HTML and JavaScript can be changed by a visitor. Server middleware protects the real route and data.

### Why cache weather for 15 minutes?

Weather does not need a new external request on every page visit. Caching reduces delay and unnecessary service usage.

## Automated proof

- `test/auth-security.test.js` covers password and token security.
- `test/auth-middleware.test.js` covers login and role decisions.
- `test/user-model.test.js` covers roles, usernames, and hidden password hashes.
- `test/weather-service.test.js` covers cache reuse, expiry, and fallback behavior.
