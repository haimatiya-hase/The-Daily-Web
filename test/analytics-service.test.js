const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const Article = require("../src/models/article.model"); // Load the article model so its statics can be replaced safely.
const ViewStat = require("../src/models/view-stat.model"); // Load the bucket model so its statics can be replaced safely.
const analytics = require("../src/services/analytics.service"); // Load the Impact Analytics rules under test.

// Build the small Mongoose query chain that the service uses.
const createQuery = (documents) => ({ select() { return this; }, sort() { return this; }, async lean() { return documents; } });

// Build one hourly bucket.
const bucket = (iso, views) => ({ start: new Date(iso), views, byVersion: {} });

test("series are gap-free at the requested resolution", () => { // Verify quiet hours show as zero.
  const buckets = [bucket("2026-09-10T09:00:00.000Z", 4), bucket("2026-09-10T11:00:00.000Z", 6)]; // Leave 10:00 empty.
  const hourly = analytics.buildSeries(buckets, new Date("2026-09-10T09:00:00.000Z"), new Date("2026-09-10T12:00:00.000Z"), "hour");
  assert.deepEqual(hourly.map((point) => point.views), [4, 0, 6, 0]); // Confirm the missing hour is filled and the window end is included.
  const daily = analytics.buildSeries(buckets, new Date("2026-09-09T05:00:00.000Z"), new Date("2026-09-10T12:00:00.000Z"), "day");
  assert.deepEqual(daily, [{ time: "2026-09-09T00:00:00.000Z", views: 0 }, { time: "2026-09-10T00:00:00.000Z", views: 10 }]); // Confirm hours fold into aligned days.
});

test("the impact of an update compares the day before with the day after", () => { // Verify the before/after numbers.
  const publishedAt = new Date("2026-09-10T14:00:00.000Z"); // Use the spec's own example hour.
  const buckets = [
    bucket("2026-09-09T13:00:00.000Z", 9), // Outside the 24-hour window before.
    bucket("2026-09-09T15:00:00.000Z", 3), // Inside the window before.
    bucket("2026-09-10T13:00:00.000Z", 2), // The hour just before.
    bucket("2026-09-10T14:00:00.000Z", 6), // The hour of the update counts as after.
    bucket("2026-09-11T13:00:00.000Z", 4), // The last hour inside the window after.
    bucket("2026-09-11T14:00:00.000Z", 8) // Outside the window after.
  ];
  assert.deepEqual(analytics.computeMarkerImpact(buckets, publishedAt), { viewsBefore: 5, viewsAfter: 10, changePercent: 100 }); // Confirm the sums and the percentage.
  assert.deepEqual(analytics.computeMarkerImpact([], publishedAt), { viewsBefore: 0, viewsAfter: 0, changePercent: null }); // Confirm no base means no percentage.
});

test("analytics returns the article, an hourly week by default, markers with impact, and a summary", async (context) => { // Verify the API shape.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them after the test.
  const now = new Date("2026-09-10T12:00:00.000Z"); // Freeze the clock for exact windows.
  const update = new Date("2026-09-08T14:00:00.000Z"); // One update inside the week.
  Article.findById = () => createQuery({ _id: "64f000000000000000000001", viewCount: 50, publishedVersion: { title: "כותרת", versionNumber: 2 }, publicationHistory: [{ versionNumber: 1, publishedAt: new Date("2026-08-20T10:00:00.000Z") }, { versionNumber: 2, publishedAt: update }] });
  ViewStat.find = () => createQuery([
    { bucketStart: new Date("2026-09-08T10:00:00.000Z"), views: 2 }, // Before the update.
    { bucketStart: new Date("2026-09-08T16:00:00.000Z"), views: 8 }, // After the update.
    { bucketStart: new Date("2026-09-10T11:00:00.000Z"), views: 5 } // The latest hour.
  ]);

  const result = await analytics.getArticleAnalytics("64f000000000000000000001", { range: "bogus", now });

  assert.equal(result.range, "7d"); // Confirm an unknown range falls back to one week.
  assert.equal(result.resolution, "hour"); // Confirm a week is drawn hourly.
  assert.equal(result.points.length, 7 * 24 + 1); // Confirm the gap-free hourly series covers the whole window.
  assert.equal(result.summary.viewsInRange, 15); // Confirm the total inside the window.
  assert.deepEqual(result.summary.peak, { time: "2026-09-08T16:00:00.000Z", views: 8 }); // Confirm the busiest hour.
  assert.equal(result.markers.length, 2); // Confirm every publication is reported.
  assert.equal(result.markers[0].inRange, false); // Confirm the first publication is outside the week.
  assert.deepEqual(result.markers[1], { versionNumber: 2, publishedAt: update.toISOString(), inRange: true, viewsBefore: 2, viewsAfter: 8, changePercent: 300 }); // Confirm the before/after impact of the update.
  assert.equal(result.article.totalViews, 50); // Confirm the counter is passed through.
});

test("the all-time range starts at the earliest activity and uses days", async (context) => { // Verify the long range.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them.
  const now = new Date("2026-09-10T12:00:00.000Z");
  Article.findById = () => createQuery({ _id: "64f000000000000000000001", viewCount: 3, publishedVersion: { title: "כותרת", versionNumber: 1, publishedAt: new Date("2026-09-05T09:00:00.000Z") }, publicationHistory: [] });
  ViewStat.find = () => createQuery([{ bucketStart: new Date("2026-09-07T09:00:00.000Z"), views: 3 }]);

  const result = await analytics.getArticleAnalytics("64f000000000000000000001", { range: "all", now });

  assert.equal(result.resolution, "day"); // Confirm all-time is drawn daily.
  assert.equal(result.from, "2026-09-05T09:00:00.000Z"); // Confirm the window starts at the first publication, which is earlier than the first bucket.
  assert.equal(result.points[0].time, "2026-09-05T00:00:00.000Z"); // Confirm the series starts on that day.
  assert.equal(result.points.length, 6); // Confirm one point per day up to today.
  assert.equal(result.markers.length, 1); // Confirm the fallback marker from the published version.
});

test("a malformed or unknown article id is rejected with 404", async (context) => { // Verify safe failures.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them.
  await assert.rejects(() => analytics.getArticleAnalytics("not-an-id"), (error) => error.statusCode === 404); // Confirm malformed ids never reach MongoDB.
  Article.findById = () => createQuery(null);
  ViewStat.find = () => createQuery([]);
  await assert.rejects(() => analytics.getArticleAnalytics("64f000000000000000000009"), (error) => error.statusCode === 404); // Confirm a missing article is reported clearly.
});
