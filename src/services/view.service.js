// Load Mongoose, the three models that a view touches, the error class, the logger, and the hash helper.
const mongoose = require("mongoose");
const ViewEvent = require("../models/view-event.model");
const ViewStat = require("../models/view-stat.model");
const Article = require("../models/article.model");
const HttpError = require("../utils/http-error");
const logger = require("../utils/logger");
const { hashClientKey } = require("../utils/client-key");

// Keep the editor statistics list at a readable page size.
const STATS_PAGE_SIZE = 20;
// Accept only the sort orders offered by the statistics screen.
const STATS_SORTS = Object.freeze(["total", "newest"]);
// Recognize common crawlers and tools so they do not inflate reader statistics.
const BOT_USER_AGENT_PATTERN = /bot|crawl|spider|slurp|headless|preview|curl|wget|python-requests|facebookexternalhit/i;
// Keep the time windows used by the summary in one place.
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// Convert any input into clean trimmed text without failing on missing values.
const cleanText = (value) => (value === undefined || value === null ? "" : String(value).trim());

// Escape search text before it becomes a MongoDB regular expression.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Return the start of the UTC hour that contains the given moment.
const hourStart = (date = new Date()) => new Date(Math.floor(date.getTime() / ONE_HOUR_MS) * ONE_HOUR_MS);

// Create a stable day key for simple daily reports.
const createDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

// Decide whether a request comes from a crawler or a command-line tool.
const isBotUserAgent = (userAgent) => BOT_USER_AGENT_PATTERN.test(String(userAgent || ""));

// Reject malformed identifiers with the same 404 used for missing articles.
const requireArticleObjectId = (articleId) => {
  if (!mongoose.isValidObjectId(articleId)) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  return new mongoose.Types.ObjectId(String(articleId));
};

// Record one article view with three small writes that stay fast under heavy traffic.
const recordArticleView = async ({ articleId, publicationVersion, clientKey, userAgent, viewedAt = new Date() }) => {
  // Skip crawlers so statistics describe readers rather than search engines.
  if (isBotUserAgent(userAgent)) {
    return { recorded: false, reason: "bot" };
  }

  const version = Number(publicationVersion) || 1;

  await Promise.all([
    // Keep one raw event so device-level questions such as "already viewed" can be answered.
    ViewEvent.create({
      article: articleId,
      publicationVersion: version,
      dayKey: createDayKey(viewedAt),
      viewedAt,
      clientKeyHash: hashClientKey(clientKey)
    }),
    // Add the view to its hourly bucket with one atomic upsert; the chart reads only these buckets.
    ViewStat.updateOne(
      { article: articleId, bucketStart: hourStart(viewedAt) },
      { $inc: { views: 1, [`byVersion.${version}`]: 1 } },
      { upsert: true }
    ),
    // Keep the article popularity counter correct with one atomic increment.
    Article.updateOne({ _id: articleId }, { $inc: { viewCount: 1 } })
  ]);

  return { recorded: true };
};

// Sum bucket views per article for one time window.
const sumViewsSince = async (articleIds, since) => {
  const groups = await ViewStat.aggregate([
    { $match: { article: { $in: articleIds }, bucketStart: { $gte: since } } },
    { $group: { _id: "$article", views: { $sum: "$views" } } }
  ]);

  // Return a lookup so the caller can attach the sums to each article.
  return new Map(groups.map((group) => [String(group._id), group.views]));
};

// List published articles with their view totals for the statistics screen.
const listArticleViewStats = async ({ search, sort, page } = {}) => {
  // Normalize the filters that the screen sends.
  const cleanSearch = cleanText(search).slice(0, 100);
  const sortBy = STATS_SORTS.includes(sort) ? sort : "total";
  const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
  const filter = { "publishedVersion.publishedAt": { $ne: null } };

  // Search the public title only, because readers can only view published articles.
  if (cleanSearch) {
    filter["publishedVersion.title"] = { $regex: escapeRegex(cleanSearch), $options: "i" };
  }

  // Order by the stored counter or by publication date; both are indexed.
  const sortOrder = sortBy === "newest"
    ? { "publishedVersion.publishedAt": -1, _id: -1 }
    : { viewCount: -1, "publishedVersion.publishedAt": -1, _id: -1 };

  // Load the page and the total together.
  const [articles, total] = await Promise.all([
    Article.find(filter)
      .select("viewCount publishedVersion.title publishedVersion.versionNumber publishedVersion.publishedAt publicationHistory")
      .sort(sortOrder)
      .skip((pageNumber - 1) * STATS_PAGE_SIZE)
      .limit(STATS_PAGE_SIZE)
      .lean(),
    Article.countDocuments(filter)
  ]);

  // Attach recent activity from the buckets for exactly the articles on this page.
  const ids = articles.map((article) => article._id);
  const now = Date.now();
  const [last24h, last7d] = await Promise.all([
    sumViewsSince(ids, new Date(now - ONE_DAY_MS)),
    sumViewsSince(ids, new Date(now - 7 * ONE_DAY_MS))
  ]);

  return {
    items: articles.map((article) => ({
      id: String(article._id),
      title: article.publishedVersion?.title || "ללא כותרת",
      publishedAt: article.publishedVersion?.publishedAt || null,
      currentVersion: Number(article.publishedVersion?.versionNumber) || 1,
      publications: Array.isArray(article.publicationHistory) ? article.publicationHistory.length : 0,
      totalViews: article.viewCount || 0,
      last24h: last24h.get(String(article._id)) || 0,
      last7d: last7d.get(String(article._id)) || 0
    })),
    total,
    pagination: {
      page: pageNumber,
      pageSize: STATS_PAGE_SIZE,
      totalPages: Math.max(Math.ceil(total / STATS_PAGE_SIZE), 1)
    },
    filters: { search: cleanSearch, sort: sortBy }
  };
};

// Describe the view statistics of one article for the detail panel.
const getArticleViewSummary = async (articleId) => {
  const objectId = requireArticleObjectId(articleId);

  // Read the article, the bucket totals, and the per-version totals together.
  const [article, rangeGroups, versionGroups, last24h, last7d] = await Promise.all([
    Article.findById(objectId)
      .select("viewCount publishedVersion.title workingVersion.title publishedVersion.versionNumber publicationHistory")
      .lean(),
    ViewStat.aggregate([
      { $match: { article: objectId } },
      { $group: { _id: null, views: { $sum: "$views" }, buckets: { $sum: 1 }, firstBucket: { $min: "$bucketStart" }, lastBucket: { $max: "$bucketStart" } } }
    ]),
    ViewStat.aggregate([
      { $match: { article: objectId } },
      { $project: { versions: { $objectToArray: "$byVersion" } } },
      { $unwind: "$versions" },
      { $group: { _id: "$versions.k", views: { $sum: "$versions.v" } } },
      { $sort: { _id: 1 } }
    ]),
    sumViewsSince([objectId], new Date(Date.now() - ONE_DAY_MS)),
    sumViewsSince([objectId], new Date(Date.now() - 7 * ONE_DAY_MS))
  ]);

  if (!article) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  const range = rangeGroups[0] || { views: 0, buckets: 0, firstBucket: null, lastBucket: null };

  return {
    article: {
      id: String(article._id),
      title: article.publishedVersion?.title || article.workingVersion?.title || "ללא כותרת",
      currentVersion: Number(article.publishedVersion?.versionNumber) || 1,
      publications: (article.publicationHistory || []).map((entry) => ({
        versionNumber: Number(entry.versionNumber) || 1,
        publishedAt: entry.publishedAt
      }))
    },
    totals: {
      // The counter is the fast public number; the bucket sum shows whether it drifted.
      counter: article.viewCount || 0,
      bucketed: range.views,
      last24h: last24h.get(String(article._id)) || 0,
      last7d: last7d.get(String(article._id)) || 0,
      buckets: range.buckets,
      firstViewAt: range.firstBucket,
      lastViewAt: range.lastBucket
    },
    byVersion: versionGroups.map((group) => ({ versionNumber: Number(group._id) || 1, views: group.views }))
  };
};

// Recompute the hourly buckets and the counter of one article from its raw events.
const rebuildArticleViewStats = async (articleId) => {
  const objectId = requireArticleObjectId(articleId);

  // Confirm the article exists before touching its statistics.
  if (!(await Article.exists({ _id: objectId }))) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  // Group the raw events by hour and version with the database instead of loading them into memory.
  const groups = await ViewEvent.aggregate([
    { $match: { article: objectId } },
    {
      $group: {
        _id: { hour: { $dateTrunc: { date: "$viewedAt", unit: "hour" } }, version: "$publicationVersion" },
        views: { $sum: 1 }
      }
    }
  ]);

  // Merge the version rows of each hour into one bucket document.
  const buckets = new Map();
  for (const group of groups) {
    const key = new Date(group._id.hour).toISOString();
    const bucket = buckets.get(key) || { article: objectId, bucketStart: new Date(group._id.hour), views: 0, byVersion: {} };
    bucket.views += group.views;
    bucket.byVersion[String(group._id.version)] = (bucket.byVersion[String(group._id.version)] || 0) + group.views;
    buckets.set(key, bucket);
  }

  const documents = [...buckets.values()];
  const total = documents.reduce((sum, bucket) => sum + bucket.views, 0);

  // Replace the buckets and align the counter so all three representations agree again.
  await ViewStat.deleteMany({ article: objectId });
  if (documents.length > 0) {
    await ViewStat.insertMany(documents);
  }
  await Article.updateOne({ _id: objectId }, { $set: { viewCount: total } });

  logger.info("View statistics rebuilt", { articleId: String(objectId), total, buckets: documents.length });

  return { total, buckets: documents.length };
};

// Remove every view record of one article and reset its counter.
const deleteArticleViewData = async (articleId) => {
  const objectId = requireArticleObjectId(articleId);

  if (!(await Article.exists({ _id: objectId }))) {
    throw new HttpError(404, "הכתבה לא נמצאה.");
  }

  // Delete the raw events and the buckets, then reset the public counter.
  const [events, stats] = await Promise.all([
    ViewEvent.deleteMany({ article: objectId }),
    ViewStat.deleteMany({ article: objectId }),
    Article.updateOne({ _id: objectId }, { $set: { viewCount: 0 } })
  ]);

  logger.info("View statistics deleted", { articleId: String(objectId), events: events.deletedCount, buckets: stats.deletedCount });

  return { deletedEvents: events.deletedCount, deletedBuckets: stats.deletedCount };
};

module.exports = {
  STATS_PAGE_SIZE,
  STATS_SORTS,
  hourStart,
  createDayKey,
  isBotUserAgent,
  recordArticleView,
  listArticleViewStats,
  getArticleViewSummary,
  rebuildArticleViewStats,
  deleteArticleViewData
};
