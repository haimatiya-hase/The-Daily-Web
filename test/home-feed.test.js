const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact feed checks.
const Article = require("../src/models/article.model"); // Load the shared model so its query can be replaced safely.
const ViewEvent = require("../src/models/view-event.model"); // Load view events so visitor filters can be tested without MongoDB.
const { hashClientKey } = require("../src/utils/client-key"); // Hash the test visitor like the real controller.
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
    skip(value) { calls.skip = value; return this; }, // Record the offset for the selected page.
    limit(value) { calls.limit = value; return this; }, // Record the maximum feed size.
    async lean() { return Array.from({ length: 21 }, () => databaseArticle); } // Return one extra result so the controller can detect another page.
  };
  Article.find = (filter) => { calls.filter = filter; return query; }; // Replace MongoDB with the recorded in-memory query.
  const res = createResponse(); // Create the response collector.
  let forwardedError = null; // Store an unexpected controller error.

  await getPublicFeed({}, res, (error) => { forwardedError = error; }); // Run the real controller action.

  assert.equal(forwardedError, null); // Confirm the successful query did not reach error middleware.
  assert.deepEqual(calls.filter, { status: "published", publishedVersion: { $ne: null } }); // Confirm drafts and missing public versions are excluded.
  assert.equal(calls.skip, 0); // Confirm the first page starts with the newest result.
  assert.equal(calls.limit, 21); // Confirm one extra result is read only to detect another page.
  assert.deepEqual(calls.sort, { "publishedVersion.publishedAt": -1, _id: -1 }); // Confirm newest articles appear first with stable ordering.
  assert.equal(res.body.sort, "publishedAt"); // Confirm the default sort choice is explicit in the AJAX response.
  assert.equal(calls.populate.path, "author"); // Confirm the reporter name is loaded for each card.
  assert.equal(res.body.articles.length, 20); // Confirm the browser still receives exactly twenty articles.
  assert.deepEqual(res.body.pagination, { page: 1, pageSize: 20, hasMore: true }); // Confirm the browser knows another page is available.
  assert.equal(res.body.articles[0].title, "כותרת מאושרת"); // Confirm the approved title reaches the browser.
  assert.equal(res.body.articles[0].viewCount, 12); // Confirm the public popularity counter is available.
  assert.equal(Object.hasOwn(res.body.articles[0], "workingVersion"), false); // Confirm the private working version is never returned.
  assert.equal(JSON.stringify(res.body).includes("כותרת פרטית"), false); // Confirm no private draft text leaked indirectly.
});

test("public feed skips earlier results and stops after the final page", async (context) => { // Verify page navigation and the final-page flag.
  const originalFind = Article.find; // Keep the real database method for other tests.
  context.after(() => { Article.find = originalFind; }); // Restore the real method when this test ends.
  const calls = {}; // Record the page offset used by the controller.
  const finalArticle = { _id: "article-21", author: null, publishedVersion: { title: "כתבה אחרונה", summary: "תקציר", imageUrl: "", category: "תרבות", publishedAt: new Date() }, viewCount: 0 }; // Build one result on the final page.
  const query = { // Simulate the Mongoose methods used for page two.
    select() { return this; }, // Keep the selected field step chainable.
    populate() { return this; }, // Keep the author population step chainable.
    sort() { return this; }, // Keep the ordering step chainable.
    skip(value) { calls.skip = value; return this; }, // Record how many earlier results are skipped.
    limit(value) { calls.limit = value; return this; }, // Record the look-ahead query size.
    async lean() { return [finalArticle]; } // Return fewer than twenty-one results to mark the final page.
  };
  Article.find = () => query; // Replace MongoDB with the final-page query.
  const res = createResponse(); // Create the response collector.

  await getPublicFeed({ query: { page: "2" } }, res, () => {}); // Request the second feed page.

  assert.equal(calls.skip, 20); // Confirm page two starts after the first twenty results.
  assert.equal(calls.limit, 21); // Confirm the query still checks for one additional result.
  assert.deepEqual(res.body.pagination, { page: 2, pageSize: 20, hasMore: false }); // Confirm infinite scroll knows when to stop.
  assert.equal(res.body.articles[0].authorName, "מערכת The Daily Web"); // Confirm a missing author uses the public fallback name.
});

test("public feed searches only approved article text through the MongoDB index", async (context) => { // Verify AJAX search uses the public text index.
  const originalFind = Article.find; // Keep the real database method for other tests.
  context.after(() => { Article.find = originalFind; }); // Restore the real method when this test ends.
  let capturedFilter = null; // Store the filter passed to MongoDB.
  const query = { // Simulate an empty search result query.
    select() { return this; }, // Keep the selected field step chainable.
    populate() { return this; }, // Keep the author population step chainable.
    sort() { return this; }, // Keep the ordering step chainable.
    skip() { return this; }, // Keep the page offset step chainable.
    limit() { return this; }, // Keep the look-ahead limit step chainable.
    async lean() { return []; } // Return no matching approved articles.
  };
  Article.find = (filter) => { capturedFilter = filter; return query; }; // Capture the real controller filter without contacting MongoDB.
  const res = createResponse(); // Create the response collector.

  await getPublicFeed({ query: { search: "  חדשות מקומיות  " } }, res, () => {}); // Search with surrounding spaces like normal user input.

  assert.deepEqual(capturedFilter, { status: "published", publishedVersion: { $ne: null }, $text: { $search: "חדשות מקומיות" } }); // Confirm the search stays inside the published-only query.
  assert.equal(res.body.search, "חדשות מקומיות"); // Confirm the normalized term is returned for predictable AJAX behavior.
  assert.equal(res.body.articles.length, 0); // Confirm an empty search result remains a successful response.
});

test("public feed combines category and viewed filters for one anonymous visitor", async (context) => { // Verify both filters stay inside the public MongoDB query.
  const originalFind = Article.find; // Keep the real article query for later tests.
  const originalDistinct = ViewEvent.distinct; // Keep the real view event query for later tests.
  context.after(() => { Article.find = originalFind; ViewEvent.distinct = originalDistinct; }); // Restore both database methods.
  const calls = {}; // Record the two MongoDB filters used by the controller.
  const viewedIds = ["article-2", "article-8"]; // Simulate articles already opened by this visitor.
  ViewEvent.distinct = async (field, filter) => { calls.distinct = { field, filter }; return viewedIds; }; // Return only this visitor's viewed article IDs.
  const query = { // Simulate a valid empty article page.
    select() { return this; }, // Keep the selected field step chainable.
    populate() { return this; }, // Keep the author population step chainable.
    sort() { return this; }, // Keep the ordering step chainable.
    skip() { return this; }, // Keep the page offset step chainable.
    limit() { return this; }, // Keep the look-ahead limit step chainable.
    async lean() { return []; } // Return no cards because only the query is under test.
  };
  Article.find = (filter) => { calls.articleFilter = filter; return query; }; // Capture the combined public article filter.
  const res = createResponse(); // Create the response collector.
  const req = { // Simulate the AJAX request created by the home page.
    query: { category: "תרבות", viewStatus: "viewed" }, // Select one approved category and viewed articles.
    get(name) { return name === "X-Client-Key" ? "browser-123" : ""; } // Send the stable anonymous browser key.
  };

  await getPublicFeed(req, res, () => {}); // Run the combined filters through the real controller.

  assert.deepEqual(calls.distinct, { field: "article", filter: { clientKeyHash: hashClientKey("browser-123") } }); // Confirm raw visitor keys never enter MongoDB.
  assert.deepEqual(calls.articleFilter, { status: "published", publishedVersion: { $ne: null }, "publishedVersion.category": "תרבות", _id: { $in: viewedIds } }); // Confirm the query requires approved, matching, viewed articles.
  assert.deepEqual(res.body.filters, { category: "תרבות", viewStatus: "viewed" }); // Confirm AJAX receives the normalized active filters.
});

test("public feed excludes viewed articles when unviewed is selected", async (context) => { // Verify the opposite view-state filter.
  const originalFind = Article.find; // Keep the real article query for later tests.
  const originalDistinct = ViewEvent.distinct; // Keep the real view event query for later tests.
  context.after(() => { Article.find = originalFind; ViewEvent.distinct = originalDistinct; }); // Restore both database methods.
  let capturedFilter = null; // Store the final article filter.
  ViewEvent.distinct = async () => ["article-3"]; // Simulate one article already viewed by this browser.
  const query = { // Simulate a valid empty article page.
    select() { return this; }, // Keep the selected field step chainable.
    populate() { return this; }, // Keep the author population step chainable.
    sort() { return this; }, // Keep the ordering step chainable.
    skip() { return this; }, // Keep the page offset step chainable.
    limit() { return this; }, // Keep the look-ahead limit step chainable.
    async lean() { return []; } // Return no cards because only the filter is under test.
  };
  Article.find = (filter) => { capturedFilter = filter; return query; }; // Capture the unviewed query.
  const req = { query: { viewStatus: "unviewed" }, get() { return "browser-456"; } }; // Send the unviewed choice and visitor key.

  await getPublicFeed(req, createResponse(), () => {}); // Run the unviewed filter through the real controller.

  assert.deepEqual(capturedFilter._id, { $nin: ["article-3"] }); // Confirm viewed IDs are removed from the public feed.
});

test("public feed sorts by popularity with stable date and id tie breakers", async (context) => { // Verify popular articles can be paginated predictably.
  const originalFind = Article.find; // Keep the real database method for other tests.
  context.after(() => { Article.find = originalFind; }); // Restore the real method when this test ends.
  let capturedSort = null; // Store the ordering sent to MongoDB.
  const query = { // Simulate a valid empty popularity query.
    select() { return this; }, // Keep the selected field step chainable.
    populate() { return this; }, // Keep the author population step chainable.
    sort(value) { capturedSort = value; return this; }, // Capture the complete stable ordering.
    skip() { return this; }, // Keep the page offset step chainable.
    limit() { return this; }, // Keep the look-ahead limit step chainable.
    async lean() { return []; } // Return no cards because only ordering is under test.
  };
  Article.find = () => query; // Replace MongoDB with the recorded query.
  const res = createResponse(); // Create the response collector.

  await getPublicFeed({ query: { sort: "popularity" } }, res, () => {}); // Request the most viewed articles first.

  assert.deepEqual(capturedSort, { viewCount: -1, "publishedVersion.publishedAt": -1, _id: -1 }); // Confirm views are primary and equal values use deterministic ordering.
  assert.equal(res.body.sort, "popularity"); // Confirm the browser receives the active sort mode.
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
