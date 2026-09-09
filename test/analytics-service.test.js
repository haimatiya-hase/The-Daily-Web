const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const ViewEvent = require("../src/models/view-event.model"); // Load the event model so its statics can be replaced safely.
const Article = require("../src/models/article.model"); // Load the article model to observe the counter update.
const { hashClientKey } = require("../src/utils/client-key"); // Hash the test device exactly like the real service.
const { recordArticleView, getArticleDailyViews } = require("../src/services/analytics.service"); // Load the view statistics under test.

test("recording a view stores one event and increments the article counter", async (context) => { // Verify the write path used by every article visit.
  const originalCreate = ViewEvent.create; // Keep the real event creation method.
  const originalUpdate = Article.updateOne; // Keep the real article update method.
  context.after(() => { ViewEvent.create = originalCreate; Article.updateOne = originalUpdate; }); // Restore both after the test.
  let storedEvent = null; // Record the event document sent to MongoDB.
  let counterUpdate = null; // Record the article counter update.
  ViewEvent.create = async (doc) => { storedEvent = doc; return doc; }; // Capture the event instead of writing to a database.
  Article.updateOne = async (filter, update) => { counterUpdate = { filter, update }; return { modifiedCount: 1 }; }; // Capture the atomic increment.

  await recordArticleView({ articleId: "a1", publicationVersion: 2, clientKey: "device-1" }); // Record one visit like the beacon endpoint does.

  assert.equal(storedEvent.article, "a1"); // Confirm the event points at the viewed article.
  assert.equal(storedEvent.publicationVersion, 2); // Confirm the event remembers which public version was read.
  assert.match(storedEvent.dayKey, /^\d{4}-\d{2}-\d{2}$/); // Confirm the event carries a valid aggregation day key.
  assert.equal(storedEvent.clientKeyHash, hashClientKey("device-1")); // Confirm only the hashed device key is stored.
  assert.deepEqual(counterUpdate.filter, { _id: "a1" }); // Confirm the counter update targets the same article.
  assert.deepEqual(counterUpdate.update, { $inc: { viewCount: 1 } }); // Confirm one atomic increment keeps parallel readers safe.
});

test("daily views are flattened into chart-ready points", async (context) => { // Verify the shape consumed by the canvas chart.
  const originalAggregate = ViewEvent.aggregate; // Keep the real aggregation method.
  context.after(() => { ViewEvent.aggregate = originalAggregate; }); // Restore it after the test.
  ViewEvent.aggregate = async () => [ // Simulate the grouped result returned by MongoDB.
    { _id: "2026-09-01", views: 4 },
    { _id: "2026-09-02", views: 9 }
  ];

  const timeline = await getArticleDailyViews("64f000000000000000000001"); // Use a valid ObjectId string like the controller does.

  assert.deepEqual(timeline, [ // Confirm the aggregation shape becomes simple chart points.
    { day: "2026-09-01", views: 4 },
    { day: "2026-09-02", views: 9 }
  ]);
});

test("an invalid article id returns an empty timeline instead of crashing", async () => { // Verify bad URL input cannot reach MongoDB.
  assert.deepEqual(await getArticleDailyViews("not-a-real-id"), []); // Confirm the service answers safely without a database call.
});
