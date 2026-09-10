// Load Mongoose, the article model, the bucket model, the error class, and the shared day-key helper.
const mongoose = require("mongoose");
const Article = require("../models/article.model");
const ViewStat = require("../models/view-stat.model");
const HttpError = require("../utils/http-error");
const { createDayKey } = require("./view.service");

// Keep the time units used by the ranges in one place.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Compare the day before and the day after each publication so the impact is stated in numbers.
const IMPACT_WINDOW_MS = DAY_MS;
// Offer short ranges with hourly detail and long ranges with daily detail.
const RANGES = Object.freeze({
  "24h": { windowMs: DAY_MS, resolution: "hour" },
  "7d": { windowMs: 7 * DAY_MS, resolution: "hour" },
  "30d": { windowMs: 30 * DAY_MS, resolution: "day" },
  all: { windowMs: null, resolution: "day" }
});
const DEFAULT_RANGE = "7d";
// Never draw the all-time range narrower than one week, so a brand-new article still gets a readable axis.
const MIN_ALL_WINDOW_MS = 7 * DAY_MS;

// Return the start of the hour or the day that contains the given moment.
const alignToResolution = (date, resolution) => {
  const step = resolution === "day" ? DAY_MS : HOUR_MS;
  return new Date(Math.floor(date.getTime() / step) * step);
};

// Return the hourly buckets of one article, optionally limited to a time window.
const getArticleHourlyBuckets = async (articleId, { from, to } = {}) => {
  // Avoid an invalid ObjectId exception when the URL contains bad input.
  if (!mongoose.isValidObjectId(articleId)) {
    return [];
  }

  const filter = { article: new mongoose.Types.ObjectId(String(articleId)) };
  // Narrow the range only when the caller asks for it.
  if (from || to) {
    filter.bucketStart = {};
    if (from) filter.bucketStart.$gte = from;
    if (to) filter.bucketStart.$lte = to;
  }

  // Read the small pre-aggregated documents instead of scanning raw events.
  const buckets = await ViewStat.find(filter)
    .select("bucketStart views byVersion")
    .sort({ bucketStart: 1 })
    .lean();

  return buckets.map((bucket) => ({
    start: new Date(bucket.bucketStart),
    views: bucket.views,
    byVersion: bucket.byVersion || {}
  }));
};

// Sum the views of the hourly buckets that start inside [from, to).
const sumBucketsBetween = (buckets, from, to) => buckets
  .filter((bucket) => bucket.start >= from && bucket.start < to)
  .reduce((sum, bucket) => sum + bucket.views, 0);

// Build a gap-free series between two moments at the requested resolution.
const buildSeries = (buckets, from, to, resolution) => {
  const step = resolution === "day" ? DAY_MS : HOUR_MS;
  const totals = new Map();

  // Fold hourly buckets into the chosen resolution.
  for (const bucket of buckets) {
    const key = alignToResolution(bucket.start, resolution).getTime();
    totals.set(key, (totals.get(key) || 0) + bucket.views);
  }

  // Walk every step of the window so quiet periods show as zero instead of disappearing.
  const points = [];
  for (let time = alignToResolution(from, resolution).getTime(); time <= to.getTime(); time += step) {
    points.push({ time: new Date(time).toISOString(), views: totals.get(time) || 0 });
  }

  return points;
};

// Describe how views changed in the day before and the day after one publication.
const computeMarkerImpact = (buckets, publishedAt) => {
  const moment = new Date(publishedAt);
  const viewsBefore = sumBucketsBetween(buckets, new Date(moment.getTime() - IMPACT_WINDOW_MS), moment);
  const viewsAfter = sumBucketsBetween(buckets, moment, new Date(moment.getTime() + IMPACT_WINDOW_MS));
  // Report a percentage only when there is a base to compare against.
  const changePercent = viewsBefore > 0 ? Math.round(((viewsAfter - viewsBefore) / viewsBefore) * 100) : null;

  return { viewsBefore, viewsAfter, changePercent };
};

// Assemble the Impact Analytics data of one article for the chart and its impact table.
const getArticleAnalytics = async (articleId, { range, now = new Date() } = {}) => {
  // Reject malformed identifiers with the same 404 used for missing articles.
  if (!mongoose.isValidObjectId(articleId)) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  // Accept only the ranges offered by the screen and default to one week.
  const rangeKey = Object.prototype.hasOwnProperty.call(RANGES, range) ? range : DEFAULT_RANGE;
  const { windowMs, resolution } = RANGES[rangeKey];

  // Read the article and every bucket together; the buckets stay small because they are hourly totals.
  const [article, buckets] = await Promise.all([
    Article.findById(articleId)
      .select("workingVersion.title publishedVersion.title publishedVersion.versionNumber publishedVersion.publishedAt publicationHistory viewCount")
      .lean(),
    getArticleHourlyBuckets(articleId)
  ]);

  if (!article) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  // Prefer the recorded history and fall back to the single known publication for older records.
  const publications = (article.publicationHistory?.length
    ? article.publicationHistory
    : [article.publishedVersion].filter((version) => version?.publishedAt)
  ).map((entry) => ({ versionNumber: Number(entry.versionNumber) || 1, publishedAt: new Date(entry.publishedAt) }));

  // Start the window at the range boundary, or for "all" at the earliest known activity but at least one week back.
  const earliest = [buckets[0]?.start, publications[0]?.publishedAt].filter(Boolean).sort((a, b) => a - b)[0] || now;
  const from = windowMs
    ? new Date(now.getTime() - windowMs)
    : new Date(Math.min(earliest.getTime(), now.getTime() - MIN_ALL_WINDOW_MS));
  const to = now;

  const points = buildSeries(buckets, from, to, resolution);
  const viewsInRange = points.reduce((sum, point) => sum + point.views, 0);
  const peak = points.reduce((best, point) => (point.views > best.views ? point : best), { time: null, views: 0 });

  return {
    article: {
      id: String(article._id),
      title: article.publishedVersion?.title || article.workingVersion?.title || "ללא כותרת",
      currentVersion: Number(article.publishedVersion?.versionNumber) || 1,
      totalViews: article.viewCount || 0
    },
    range: rangeKey,
    resolution,
    from: from.toISOString(),
    to: to.toISOString(),
    points,
    // Give every publication its before/after numbers, and say whether it falls inside the drawn window.
    markers: publications.map((publication) => ({
      versionNumber: publication.versionNumber,
      publishedAt: publication.publishedAt.toISOString(),
      inRange: publication.publishedAt >= from && publication.publishedAt <= to,
      ...computeMarkerImpact(buckets, publication.publishedAt)
    })),
    summary: { viewsInRange, peak }
  };
};

module.exports = {
  RANGES,
  DEFAULT_RANGE,
  IMPACT_WINDOW_MS,
  MIN_ALL_WINDOW_MS,
  alignToResolution,
  buildSeries,
  computeMarkerImpact,
  getArticleHourlyBuckets,
  getArticleAnalytics,
  createDayKey
};
