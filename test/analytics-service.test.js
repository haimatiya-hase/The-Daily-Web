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
  assert.equal(result.from, "2026-09-03T12:00:00.000Z"); // Confirm the window is widened to one week because the first publication is only five days old.
  assert.equal(result.points[0].time, "2026-09-03T00:00:00.000Z"); // Confirm the series starts on that day.
  assert.equal(result.points.length, 8); // Confirm one point per day up to today.
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

test("an article without views or history yields a single zero point and no markers", async (context) => { // Verify the empty case never crashes the chart.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them.
  const now = new Date("2026-09-10T12:30:00.000Z");
  Article.findById = () => createQuery({ _id: "64f000000000000000000001", viewCount: 0, publishedVersion: { title: "ריקה", versionNumber: 1 }, publicationHistory: [] });
  ViewStat.find = () => createQuery([]);

  const result = await analytics.getArticleAnalytics("64f000000000000000000001", { range: "all", now });

  assert.deepEqual(result.markers, []); // Confirm no marker is invented.
  assert.equal(result.points.length, 8); // Confirm the all-time axis still spans one week at zero.
  assert.ok(result.points.every((point) => point.views === 0)); // Confirm every point is zero.
  assert.deepEqual(result.summary, { viewsInRange: 0, peak: { time: null, views: 0 } }); // Confirm an honest empty summary.
});

test("the 24-hour range is hourly, and a marker on the window edge counts as in range", async (context) => { // Verify boundaries.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them.
  const now = new Date("2026-09-10T12:00:00.000Z");
  const edge = new Date("2026-09-09T12:00:00.000Z"); // Exactly 24 hours ago.
  Article.findById = () => createQuery({ _id: "64f000000000000000000001", viewCount: 1, publishedVersion: { title: "קצה", versionNumber: 2 }, publicationHistory: [{ versionNumber: 1, publishedAt: new Date("2026-09-01T00:00:00.000Z") }, { versionNumber: 2, publishedAt: edge }] });
  ViewStat.find = () => createQuery([{ bucketStart: new Date("2026-09-10T11:00:00.000Z"), views: 1 }]);

  const result = await analytics.getArticleAnalytics("64f000000000000000000001", { range: "24h", now });

  assert.equal(result.resolution, "hour"); // Confirm hourly detail for one day.
  assert.equal(result.points.length, 25); // Confirm 24 steps plus the current hour.
  assert.equal(result.markers[1].inRange, true); // Confirm the edge marker is drawn.
  assert.equal(result.markers[0].inRange, false); // Confirm the older publication is not.
});

test("impact math works on whole hourly buckets around an unaligned publication time", () => { // Verify the granularity rule is explicit.
  const publishedAt = new Date("2026-09-10T14:38:00.000Z"); // A publication in the middle of an hour, like real approvals.
  const buckets = [bucket("2026-09-10T14:00:00.000Z", 5), bucket("2026-09-10T15:00:00.000Z", 7)];
  const impact = analytics.computeMarkerImpact(buckets, publishedAt);
  assert.equal(impact.viewsBefore, 5); // The bucket that starts before the publication counts as before.
  assert.equal(impact.viewsAfter, 7); // Only buckets that start after it count as after.
});

test("series building is safe when the window is empty or reversed", () => { // Verify defensive behavior.
  assert.deepEqual(analytics.buildSeries([], new Date("2026-09-10T12:00:00.000Z"), new Date("2026-09-10T11:00:00.000Z"), "hour"), []); // A reversed window yields nothing.
  assert.equal(analytics.buildSeries([], new Date("2026-09-10T12:10:00.000Z"), new Date("2026-09-10T12:20:00.000Z"), "hour").length, 1); // A window inside one hour yields that hour.
  assert.equal(analytics.alignToResolution(new Date("2026-09-10T23:59:59.999Z"), "day").toISOString(), "2026-09-10T00:00:00.000Z"); // Days align to UTC midnight.
});

test("the all-time range keeps the earliest activity when it is older than one week", async (context) => { // Verify the minimum window never cuts real history.
  const originalFind = Article.findById; const originalStat = ViewStat.find; // Keep the real queries.
  context.after(() => { Article.findById = originalFind; ViewStat.find = originalStat; }); // Restore them.
  const now = new Date("2026-09-10T12:00:00.000Z");
  Article.findById = () => createQuery({ _id: "64f000000000000000000001", viewCount: 2, publishedVersion: { title: "ותיקה", versionNumber: 1 }, publicationHistory: [{ versionNumber: 1, publishedAt: new Date("2026-07-01T08:00:00.000Z") }] });
  ViewStat.find = () => createQuery([{ bucketStart: new Date("2026-07-02T09:00:00.000Z"), views: 2 }]);

  const result = await analytics.getArticleAnalytics("64f000000000000000000001", { range: "all", now });

  assert.equal(result.from, "2026-07-01T08:00:00.000Z"); // Confirm the window starts at the first publication.
  assert.equal(result.points[0].time, "2026-07-01T00:00:00.000Z"); // Confirm the daily series starts on that day.
  assert.equal(result.summary.viewsInRange, 2); // Confirm old views are included.
});
