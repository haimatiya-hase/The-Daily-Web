// Load Mongoose and the hourly bucket model that every chart reads from.
const mongoose = require("mongoose");
const ViewStat = require("../models/view-stat.model");
const { createDayKey } = require("./view.service");

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
    start: bucket.bucketStart,
    views: bucket.views,
    byVersion: bucket.byVersion || {}
  }));
};

// Return total views per day so the Impact Analytics graph can draw one clear line.
const getArticleDailyViews = async (articleId) => {
  const buckets = await getArticleHourlyBuckets(articleId);
  const days = new Map();

  // Fold the hourly buckets into days while keeping the ascending order.
  for (const bucket of buckets) {
    const day = createDayKey(new Date(bucket.start));
    days.set(day, (days.get(day) || 0) + bucket.views);
  }

  return [...days].map(([day, views]) => ({ day, views }));
};

module.exports = { getArticleHourlyBuckets, getArticleDailyViews, createDayKey };
