const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact feed checks.
const Article = require("../src/models/article.model"); // Load the shared model so its query can be replaced safely.
const { getPublicFeed } = require("../src/controllers/home.controller"); // Load the public feed action under test.

function createResponse() { // Build the small part of an Express response used by this controller.
  return { // Return a response object that records the JSON body.
    body: null, // Store the public response for assertions.
    json(body) { this.body = body; return this; } // Save the response body and keep Express-style chaining.
  };
}

test("public feed returns only approved fields from twenty published articles", async (context) => { // Verify the public data boundary and query limit.
  const originalFind = Article.find; // Keep the real database method for other tests.
  context.after(() => { Article.find = originalFind; }); // Restore the real method when this test ends.
  const calls = {}; // Record every part of the simulated Mongoose query.
  const databaseArticle = { // Build one result containing both private and public versions.
    _id: "article-1", // Use a stable ID for the public link.
    author: { displayName: "כתב לדוגמה" }, // Provide the populated public author name.
    workingVersion: { title: "כותרת פרטית" }, // Include private data that must never reach the response.
    publishedVersion: { title: "כותרת מאושרת", summary: "תקציר מאושר", imageUrl: "/image.svg", category: "חדשות", publishedAt: new Date("2026-09-01T10:00:00.000Z") }, // Provide the approved public snapshot.
    viewCount: 12 // Provide the public popularity counter.
  };
  const query = { // Simulate the small chain of Mongoose query methods used by the controller.
    select(value) { calls.select = value; return this; }, // Record the selected database fields.
    populate(path, fields) { calls.populate = { path, fields }; return this; }, // Record the author population.
    sort(value) { calls.sort = value; return this; }, // Record the newest-first ordering.
    limit(value) { calls.limit = value; return this; }, // Record the maximum feed size.
    async lean() { return [databaseArticle]; } // Return plain objects like a real lean query.
  };
  Article.find = (filter) => { calls.filter = filter; return query; }; // Replace MongoDB with the recorded in-memory query.
  const res = createResponse(); // Create the response collector.
  let forwardedError = null; // Store an unexpected controller error.

  await getPublicFeed({}, res, (error) => { forwardedError = error; }); // Run the real controller action.

  assert.equal(forwardedError, null); // Confirm the successful query did not reach error middleware.
  assert.deepEqual(calls.filter, { status: "published", publishedVersion: { $ne: null } }); // Confirm drafts and missing public versions are excluded.
  assert.equal(calls.limit, 20); // Confirm the first request cannot return more than twenty articles.
  assert.deepEqual(calls.sort, { "publishedVersion.publishedAt": -1, _id: -1 }); // Confirm newest articles appear first with stable ordering.
  assert.equal(calls.populate.path, "author"); // Confirm the reporter name is loaded for each card.
  assert.equal(res.body.articles[0].title, "כותרת מאושרת"); // Confirm the approved title reaches the browser.
  assert.equal(res.body.articles[0].viewCount, 12); // Confirm the public popularity counter is available.
  assert.equal(Object.hasOwn(res.body.articles[0], "workingVersion"), false); // Confirm the private working version is never returned.
  assert.equal(JSON.stringify(res.body).includes("כותרת פרטית"), false); // Confirm no private draft text leaked indirectly.
});

test("public feed forwards database failures to the shared API handler", async (context) => { // Verify normal Express error handling.
  const originalFind = Article.find; // Keep the real database method for other tests.
  context.after(() => { Article.find = originalFind; }); // Restore the real method when this test ends.
  const databaseError = new Error("Database unavailable"); // Create one predictable simulated failure.
  Article.find = () => { throw databaseError; }; // Make the feed query fail before returning data.
  const res = createResponse(); // Create an unused response collector.
  let forwardedError = null; // Store the error passed to middleware.

  await getPublicFeed({}, res, (error) => { forwardedError = error; }); // Run the controller with the failed query.

  assert.equal(forwardedError, databaseError); // Confirm the shared error middleware receives the original failure.
  assert.equal(res.body, null); // Confirm the controller did not send a partial response.
});
