const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const ViewStat = require("../src/models/view-stat.model"); // Load the bucket model so its statics can be replaced safely.
const { getArticleDailyViews, getArticleHourlyBuckets } = require("../src/services/analytics.service"); // Load the chart read path under test.

// Build the small Mongoose query chain that the service uses.
const createQuery = (documents, calls) => ({
  select(value) { calls.select = value; return this; },
  sort(value) { calls.sort = value; return this; },
  async lean() { return documents; }
});

test("charts read pre-aggregated hourly buckets instead of raw events", async (context) => { // Verify the read path scales.
  const originalFind = ViewStat.find; // Keep the real bucket query.
  context.after(() => { ViewStat.find = originalFind; }); // Restore it after the test.
  const calls = {};
  ViewStat.find = (filter) => { calls.filter = filter; return createQuery([ // Simulate three hourly buckets over two days.
    { bucketStart: new Date("2026-09-01T09:00:00.000Z"), views: 4, byVersion: { 1: 4 } },
    { bucketStart: new Date("2026-09-01T15:00:00.000Z"), views: 6, byVersion: { 1: 6 } },
    { bucketStart: new Date("2026-09-02T10:00:00.000Z"), views: 9, byVersion: { 2: 9 } }
  ], calls); };

  const from = new Date("2026-09-01T00:00:00.000Z"); // Ask for a window.
  const buckets = await getArticleHourlyBuckets("64f000000000000000000001", { from });

  assert.equal(String(calls.filter.article), "64f000000000000000000001"); // Confirm the article filter.
  assert.deepEqual(calls.filter.bucketStart, { $gte: from }); // Confirm the window narrows the query.
  assert.deepEqual(calls.sort, { bucketStart: 1 }); // Confirm ascending time order.
  assert.equal(buckets.length, 3); // Confirm every bucket is returned.
  assert.deepEqual(buckets[2], { start: new Date("2026-09-02T10:00:00.000Z"), views: 9, byVersion: { 2: 9 } }); // Confirm the chart-ready shape.
});

test("daily views fold the hourly buckets by day", async (context) => { // Verify the existing daily chart still works.
  const originalFind = ViewStat.find; // Keep the real bucket query.
  context.after(() => { ViewStat.find = originalFind; }); // Restore it after the test.
  ViewStat.find = () => createQuery([
    { bucketStart: new Date("2026-09-01T09:00:00.000Z"), views: 4 },
    { bucketStart: new Date("2026-09-01T15:00:00.000Z"), views: 6 },
    { bucketStart: new Date("2026-09-02T10:00:00.000Z"), views: 9 }
  ], {});

  const timeline = await getArticleDailyViews("64f000000000000000000001");

  assert.deepEqual(timeline, [{ day: "2026-09-01", views: 10 }, { day: "2026-09-02", views: 9 }]); // Confirm the hours of one day are summed.
});

test("an invalid article id returns an empty timeline instead of crashing", async () => { // Verify bad URL input cannot reach MongoDB.
  assert.deepEqual(await getArticleDailyViews("not-a-real-id"), []); // Confirm the service answers safely without a database call.
  assert.deepEqual(await getArticleHourlyBuckets("not-a-real-id"), []); // Confirm the same for the hourly read.
});
