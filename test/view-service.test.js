const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const ViewEvent = require("../src/models/view-event.model"); // Load the raw event model so its statics can be replaced safely.
const ViewStat = require("../src/models/view-stat.model"); // Load the bucket model so its statics can be replaced safely.
const Article = require("../src/models/article.model"); // Load the article model to observe the counter update.
const { hashClientKey } = require("../src/utils/client-key"); // Hash the test device exactly like the real service.
const viewService = require("../src/services/view.service"); // Load the statistics rules under test.

// Build the small Mongoose query chain that the service uses for the list query.
const createQuery = (documents, calls) => ({
  select(value) { calls.select = value; return this; },
  sort(value) { calls.sort = value; return this; },
  skip(value) { calls.skip = value; return this; },
  limit(value) { calls.limit = value; return this; },
  async lean() { return documents; }
});

test("hours and days are derived from the view time", () => { // Verify the bucket keys.
  const moment = new Date("2026-09-10T14:37:52.123Z"); // Use a time in the middle of an hour.
  assert.equal(viewService.hourStart(moment).toISOString(), "2026-09-10T14:00:00.000Z"); // Confirm the bucket starts at the hour.
  assert.equal(viewService.createDayKey(moment), "2026-09-10"); // Confirm the day key.
});

test("crawlers and command-line tools are not counted as readers", () => { // Verify the bot filter.
  assert.equal(viewService.isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(viewService.isBotUserAgent("curl/8.4.0"), true);
  assert.equal(viewService.isBotUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"), false);
  assert.equal(viewService.isBotUserAgent(""), false); // Confirm a missing agent is still counted.
});

test("recording a view writes the event, the hourly bucket, and the counter together", async (context) => { // Verify the O(1) write path.
  const originalCreate = ViewEvent.create; // Keep the real event creation.
  const originalStat = ViewStat.updateOne; // Keep the real bucket upsert.
  const originalArticle = Article.updateOne; // Keep the real counter update.
  context.after(() => { ViewEvent.create = originalCreate; ViewStat.updateOne = originalStat; Article.updateOne = originalArticle; }); // Restore all three.
  const calls = {}; // Record every write.
  ViewEvent.create = async (doc) => { calls.event = doc; return doc; };
  ViewStat.updateOne = async (filter, update, options) => { calls.bucket = { filter, update, options }; return {}; };
  Article.updateOne = async (filter, update) => { calls.counter = { filter, update }; return {}; };
  const viewedAt = new Date("2026-09-10T14:37:52.123Z"); // Use a fixed time so the bucket is predictable.

  const result = await viewService.recordArticleView({ articleId: "a1", publicationVersion: 2, clientKey: "device-1", userAgent: "Chrome", viewedAt });

  assert.deepEqual(result, { recorded: true }); // Confirm the visit was counted.
  assert.equal(calls.event.clientKeyHash, hashClientKey("device-1")); // Confirm only the hashed device key is stored.
  assert.equal(calls.event.dayKey, "2026-09-10"); // Confirm the event carries its day key.
  assert.equal(calls.event.publicationVersion, 2); // Confirm the event remembers which version was read.
  assert.deepEqual(calls.bucket.filter, { article: "a1", bucketStart: new Date("2026-09-10T14:00:00.000Z") }); // Confirm the bucket is the article's hour.
  assert.deepEqual(calls.bucket.update, { $inc: { views: 1, "byVersion.2": 1 } }); // Confirm one atomic increment per version.
  assert.deepEqual(calls.bucket.options, { upsert: true }); // Confirm the first view of an hour creates the bucket.
  assert.deepEqual(calls.counter, { filter: { _id: "a1" }, update: { $inc: { viewCount: 1 } } }); // Confirm the popularity counter grows atomically.
});

test("a crawler visit is skipped without any database write", async (context) => { // Verify bots never touch the statistics.
  const originalCreate = ViewEvent.create; // Keep the real event creation.
  context.after(() => { ViewEvent.create = originalCreate; }); // Restore it after the test.
  let wrote = false; // Detect an unexpected write.
  ViewEvent.create = async () => { wrote = true; };

  const result = await viewService.recordArticleView({ articleId: "a1", publicationVersion: 1, clientKey: "x", userAgent: "Googlebot/2.1" });

  assert.deepEqual(result, { recorded: false, reason: "bot" }); // Confirm the reason is reported.
  assert.equal(wrote, false); // Confirm nothing was written.
});

test("the statistics list searches published titles, pages, and adds recent activity", async (context) => { // Verify Read (List/Search) for the statistics model.
  const originalFind = Article.find; // Keep the real article query.
  const originalCount = Article.countDocuments; // Keep the real count.
  const originalAggregate = ViewStat.aggregate; // Keep the real bucket aggregation.
  context.after(() => { Article.find = originalFind; Article.countDocuments = originalCount; ViewStat.aggregate = originalAggregate; }); // Restore all three.
  const calls = {}; // Record the queries.
  const article = { _id: "64f000000000000000000001", viewCount: 40, publishedVersion: { title: "פסטיבל הקיץ", versionNumber: 2, publishedAt: new Date("2026-09-01T10:00:00.000Z") }, publicationHistory: [{}, {}] }; // Build one published article.
  Article.find = (filter) => { calls.filter = filter; return createQuery([article], calls); };
  Article.countDocuments = async () => 1;
  const aggregateCalls = []; // Record both time-window aggregations.
  ViewStat.aggregate = async (pipeline) => { aggregateCalls.push(pipeline); return [{ _id: article._id, views: aggregateCalls.length === 1 ? 5 : 30 }]; };

  const result = await viewService.listArticleViewStats({ search: " פסטיבל ", sort: "newest", page: "2" });

  assert.deepEqual(calls.filter["publishedVersion.publishedAt"], { $ne: null }); // Confirm only published articles are listed.
  assert.deepEqual(calls.filter["publishedVersion.title"], { $regex: "פסטיבל", $options: "i" }); // Confirm the trimmed search reaches the title.
  assert.deepEqual(calls.sort, { "publishedVersion.publishedAt": -1, _id: -1 }); // Confirm the newest sort.
  assert.equal(calls.skip, viewService.STATS_PAGE_SIZE); // Confirm the second page skips one page.
  assert.equal(calls.limit, viewService.STATS_PAGE_SIZE); // Confirm the page size.
  assert.equal(aggregateCalls.length, 2); // Confirm the 24-hour and 7-day sums are computed for the page.
  assert.deepEqual(result.items[0], { id: article._id, title: "פסטיבל הקיץ", publishedAt: article.publishedVersion.publishedAt, currentVersion: 2, publications: 2, totalViews: 40, last24h: 5, last7d: 30 }); // Confirm the row shape.
  assert.deepEqual(result.filters, { search: "פסטיבל", sort: "newest" }); // Confirm the normalized filters are echoed.
});

test("an unknown sort falls back to the total order", async (context) => { // Verify bad query input cannot break the sort.
  const originalFind = Article.find; const originalCount = Article.countDocuments; const originalAggregate = ViewStat.aggregate; // Keep the real methods.
  context.after(() => { Article.find = originalFind; Article.countDocuments = originalCount; ViewStat.aggregate = originalAggregate; }); // Restore them.
  const calls = {};
  Article.find = () => createQuery([], calls);
  Article.countDocuments = async () => 0;
  ViewStat.aggregate = async () => [];

  const result = await viewService.listArticleViewStats({ sort: "random", page: "-3" });

  assert.deepEqual(calls.sort, { viewCount: -1, "publishedVersion.publishedAt": -1, _id: -1 }); // Confirm the default sort.
  assert.equal(result.pagination.page, 1); // Confirm an invalid page becomes the first page.
  assert.equal(result.filters.sort, "total"); // Confirm the fallback is reported.
});

test("rebuilding merges hourly groups per version and realigns the counter", async (context) => { // Verify the Update action of the statistics model.
  const originalExists = Article.exists; const originalAggregate = ViewEvent.aggregate; const originalDelete = ViewStat.deleteMany; const originalInsert = ViewStat.insertMany; const originalUpdate = Article.updateOne; // Keep the real methods.
  context.after(() => { Article.exists = originalExists; ViewEvent.aggregate = originalAggregate; ViewStat.deleteMany = originalDelete; ViewStat.insertMany = originalInsert; Article.updateOne = originalUpdate; }); // Restore them.
  const articleId = "64f000000000000000000001"; // Use a valid ObjectId string.
  const hour = new Date("2026-09-10T14:00:00.000Z"); // Use one hour with two versions.
  const calls = {};
  Article.exists = async () => true;
  ViewEvent.aggregate = async () => [ // Simulate the grouped events returned by MongoDB.
    { _id: { hour, version: 1 }, views: 3 },
    { _id: { hour, version: 2 }, views: 5 },
    { _id: { hour: new Date("2026-09-10T15:00:00.000Z"), version: 2 }, views: 2 }
  ];
  ViewStat.deleteMany = async (filter) => { calls.deleted = filter; return {}; };
  ViewStat.insertMany = async (docs) => { calls.inserted = docs; return docs; };
  Article.updateOne = async (filter, update) => { calls.counter = update; return {}; };

  const result = await viewService.rebuildArticleViewStats(articleId);

  assert.equal(String(calls.deleted.article), articleId); // Confirm the old buckets of this article are replaced.
  assert.equal(calls.inserted.length, 2); // Confirm one bucket per hour.
  const first = calls.inserted.find((doc) => doc.bucketStart.getTime() === hour.getTime()); // Find the merged hour.
  assert.equal(first.views, 8); // Confirm both versions were merged into one hour total.
  assert.deepEqual(first.byVersion, { 1: 3, 2: 5 }); // Confirm the per-version breakdown survived the merge.
  assert.deepEqual(calls.counter, { $set: { viewCount: 10 } }); // Confirm the counter equals the sum of all events.
  assert.deepEqual(result, { total: 10, buckets: 2 }); // Confirm the reported result.
});

test("rebuild and delete reject unknown or malformed articles with 404", async (context) => { // Verify safe failures.
  const originalExists = Article.exists; // Keep the real existence check.
  context.after(() => { Article.exists = originalExists; }); // Restore it.
  Article.exists = async () => null;

  await assert.rejects(() => viewService.rebuildArticleViewStats("not-an-id"), (error) => error.statusCode === 404); // Confirm malformed ids never reach MongoDB.
  await assert.rejects(() => viewService.deleteArticleViewData("64f000000000000000000009"), (error) => error.statusCode === 404); // Confirm a missing article is reported clearly.
});

test("deleting view data removes events and buckets and resets the counter", async (context) => { // Verify the Delete action of the statistics model.
  const originalExists = Article.exists; const originalEvents = ViewEvent.deleteMany; const originalStats = ViewStat.deleteMany; const originalUpdate = Article.updateOne; // Keep the real methods.
  context.after(() => { Article.exists = originalExists; ViewEvent.deleteMany = originalEvents; ViewStat.deleteMany = originalStats; Article.updateOne = originalUpdate; }); // Restore them.
  const calls = {};
  Article.exists = async () => true;
  ViewEvent.deleteMany = async () => ({ deletedCount: 120 });
  ViewStat.deleteMany = async () => ({ deletedCount: 30 });
  Article.updateOne = async (filter, update) => { calls.counter = update; return {}; };

  const result = await viewService.deleteArticleViewData("64f000000000000000000001");

  assert.deepEqual(result, { deletedEvents: 120, deletedBuckets: 30 }); // Confirm both stores were cleared.
  assert.deepEqual(calls.counter, { $set: { viewCount: 0 } }); // Confirm the public counter is reset.
});
