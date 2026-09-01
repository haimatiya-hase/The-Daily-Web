// Load Node's built-in test runner without adding another package.
const test = require("node:test");
// Load strict assertions so permission results are checked exactly.
const assert = require("node:assert/strict");
// Load the server-side middleware functions that protect private routes.
const { requireAuth, requireRole } = require("../src/middleware/auth.middleware");

// Create the Express request fields used by the permission middleware.
function createRequest(user = null, options = {}) {
  // Return a small request object that behaves like Express during these tests.
  return {
    // Store the connected user or null for a guest.
    user,
    // Use a browser page path unless a test selects an API path.
    originalUrl: options.originalUrl || "/reporter",
    // Return the selected Accept header through Express's req.get method.
    get(headerName) {
      // Return JSON only when the test explicitly requests it.
      return headerName === "Accept" ? options.accept || "text/html" : "";
    }
  };
}

// Create a small response object that records status and rendered page values.
function createResponse() {
  // Return only the Express methods required by the authentication middleware.
  return {
    // Start without a response status so the test can detect changes.
    statusCode: null,
    // Start without rendered output so the test can inspect the final result.
    rendered: null,
    // Start without JSON output so API tests can inspect the final result.
    jsonBody: null,
    // Save the selected status code and preserve Express method chaining.
    status(code) {
      // Record the status selected by the middleware.
      this.statusCode = code;
      // Return this response so the following render call remains valid.
      return this;
    },
    // Record the template and values that would be sent to the browser.
    render(view, values) {
      // Save the rendered result for later assertions.
      this.rendered = { view, values };
    },
    // Record the JSON value that would be returned to an AJAX caller.
    json(value) {
      // Save the JSON response for later assertions.
      this.jsonBody = value;
    }
  };
}

// Verify that guests cannot enter routes that require authentication.
test("requireAuth blocks guests with status 401", () => {
  // Create a request without a loaded user to represent a guest.
  const req = createRequest();
  // Create a response recorder for the middleware result.
  const res = createResponse();
  // Track whether the protected route was allowed to continue.
  let continued = false;
  // Run the middleware with a next function that records access.
  requireAuth(req, res, () => { continued = true; });
  // Confirm that unauthenticated access receives status 401.
  assert.equal(res.statusCode, 401);
  // Confirm that the protected route was not allowed to continue.
  assert.equal(continued, false);
  // Confirm that the shared error page was selected.
  assert.equal(res.rendered.view, "pages/error");
});

// Verify that authenticated users can pass the general authentication guard.
test("requireAuth allows a connected user", () => {
  // Create a request with the minimum authenticated user information.
  const req = createRequest({ role: "reporter" });
  // Create a response recorder that should remain unused.
  const res = createResponse();
  // Track whether the protected route was allowed to continue.
  let continued = false;
  // Run the middleware and record the next call.
  requireAuth(req, res, () => { continued = true; });
  // Confirm that the authenticated request continued to the route.
  assert.equal(continued, true);
  // Confirm that no error response status was created.
  assert.equal(res.statusCode, null);
});

// Verify that reporters can enter routes reserved for reporters.
test("requireRole allows the matching role", () => {
  // Create a request for a connected reporter.
  const req = createRequest({ role: "reporter" });
  // Create a response recorder that should remain unused.
  const res = createResponse();
  // Track whether role validation allowed the route to continue.
  let continued = false;
  // Build the reporter guard and run it for the sample request.
  requireRole("reporter")(req, res, () => { continued = true; });
  // Confirm that a reporter passed the reporter role check.
  assert.equal(continued, true);
  // Confirm that no error status was created for the matching role.
  assert.equal(res.statusCode, null);
});

// Verify that reporters cannot enter routes reserved for editors.
test("requireRole blocks a different role with status 403", () => {
  // Create a request for a connected reporter.
  const req = createRequest({ role: "reporter" });
  // Create a response recorder for the expected permission error.
  const res = createResponse();
  // Track whether the editor route was incorrectly allowed to continue.
  let continued = false;
  // Build the editor guard and run it for the reporter request.
  requireRole("editor")(req, res, () => { continued = true; });
  // Confirm that the mismatched role receives status 403.
  assert.equal(res.statusCode, 403);
  // Confirm that the protected editor route did not continue.
  assert.equal(continued, false);
  // Confirm that the response contains the matching permission status.
  assert.equal(res.rendered.values.statusCode, 403);
});

// Verify that guests receive authentication feedback before role validation.
test("requireRole blocks guests with status 401", () => {
  // Create a request without a connected user.
  const req = createRequest();
  // Create a response recorder for the expected login error.
  const res = createResponse();
  // Track whether the protected route was incorrectly allowed to continue.
  let continued = false;
  // Run an editor guard for the unauthenticated request.
  requireRole("editor")(req, res, () => { continued = true; });
  // Confirm that guests receive status 401 instead of status 403.
  assert.equal(res.statusCode, 401);
  // Confirm that the protected route did not continue.
  assert.equal(continued, false);
});

// Verify that protected API routes return JSON instead of rendering HTML.
test("requireAuth returns JSON for unauthenticated API requests", () => {
  // Create a guest request for a protected API address.
  const req = createRequest(null, { originalUrl: "/api/editor/articles", accept: "application/json" });
  // Create a response recorder for the expected JSON error.
  const res = createResponse();
  // Run the authentication guard for the sample API request.
  requireAuth(req, res, () => {});
  // Confirm that the API uses the unauthorized status code.
  assert.equal(res.statusCode, 401);
  // Confirm that the API returns the structured error code in JSON.
  assert.equal(res.jsonBody.error.statusCode, 401);
  // Confirm that no HTML template was rendered for the API request.
  assert.equal(res.rendered, null);
});
