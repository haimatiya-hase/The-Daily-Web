const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const http = require("node:http"); // Drive the real Express app over HTTP without a database.
const createApp = require("../src/app"); // Build the application exactly like the server does.

// Start the app on a random free port for one test and return a small request helper.
const startApp = async (context) => {
  const server = http.createServer(createApp()); // Wrap the Express app in a plain HTTP server.
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); // Bind to any free port.
  context.after(() => new Promise((resolve) => server.close(resolve))); // Close the server after the test.
  const { port } = server.address();

  return (path, headers = {}) => new Promise((resolve, reject) => { // Return status, headers, and body of one GET.
    http.get({ host: "127.0.0.1", port, path, headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on("error", reject);
  });
};

test("a guest cannot read analytics and receives the JSON error format", async (context) => { // Verify the server-side guard.
  const get = await startApp(context);
  const response = await get("/api/analytics/64f000000000000000000001?range=7d", { Accept: "application/json" });

  assert.equal(response.status, 401); // Confirm authentication is required.
  assert.match(response.headers["content-type"], /application\/json/); // Confirm API callers get JSON, not an HTML page.
  assert.deepEqual(JSON.parse(response.body).error.statusCode, 401); // Confirm the shared error shape.
});

test("a guest cannot open the statistics page and gets the HTML error page", async (context) => { // Verify the page guard.
  const get = await startApp(context);
  const response = await get("/editor/views", { Accept: "text/html" });

  assert.equal(response.status, 401); // Confirm the page is protected on the server.
  assert.match(response.headers["content-type"], /text\/html/); // Confirm browsers get a rendered page.
  assert.match(response.body, /נדרשת התחברות/); // Confirm the Hebrew explanation is shown.
});

test("Chart.js is served locally from node_modules", async (context) => { // Verify the graph does not depend on a CDN.
  const get = await startApp(context);
  const response = await get("/vendor/chart.js/chart.umd.js");

  assert.equal(response.status, 200); // Confirm the build is reachable.
  assert.match(response.headers["content-type"], /javascript/); // Confirm it is served as a script.
  assert.ok(response.body.length > 100000); // Confirm the full UMD build is returned.
  assert.match(response.body, /Chart\.js/); // Confirm it is the Chart.js bundle.
});

test("the old editor analytics route is gone and other node_modules files are not exposed", async (context) => { // Verify no dead or dangerous surface.
  const get = await startApp(context);
  const oldRoute = await get("/api/editor/articles/64f000000000000000000001/analytics", { Accept: "application/json" });
  assert.equal(oldRoute.status, 404); // Confirm the endpoint moved and nothing answers at the old address.
  const escape = await get("/vendor/chart.js/../../express/package.json");
  assert.notEqual(escape.status, 200); // Confirm the static mount cannot be used to walk out of the dist folder.
  const other = await get("/vendor/express/package.json");
  assert.equal(other.status, 404); // Confirm only the Chart.js dist folder is mounted.
});

test("API responses forbid browser caching so counters are always fresh after back navigation", async (context) => { // Verify the regression that hid new views on the statistics page.
  const get = await startApp(context);
  const response = await get("/api/health", { Accept: "application/json" });

  assert.equal(response.status, 200); // Confirm the endpoint answers.
  assert.equal(response.headers["cache-control"], "no-store"); // Confirm browsers must refetch every API response.
});
