// Load Mongoose, the view event and article models, and the shared hash helper.
const mongoose = require("mongoose");
const ViewEvent = require("../models/view-event.model");
const Article = require("../models/article.model");
const { hashClientKey } = require("../utils/client-key");

// Create a stable day key for grouped analytics.
const createDayKey = (date = new Date()) => {
  // Keep only the UTC date so events can be grouped by day.
  return date.toISOString().slice(0, 10);
};

// Record one article view for later aggregation.
const recordArticleView = async ({ articleId, publicationVersion, clientKey }) => {
  // Run both cheap writes together so thousands of parallel readers stay fast.
  const [viewEvent] = await Promise.all([
    // Store a small append-only event that the timeline aggregation reads later.
    ViewEvent.create({
      article: articleId,
      publicationVersion,
      dayKey: createDayKey(),
      viewedAt: new Date(),
      clientKeyHash: hashClientKey(clientKey)
    }),
    // Keep the article popularity counter correct with one atomic increment.
    Article.updateOne({ _id: articleId }, { $inc: { viewCount: 1 } })
  ]);

  return viewEvent;
};

// Return daily views grouped by publication version.
const getArticleTimeline = async (articleId) => {
  // Avoid an invalid ObjectId exception when the URL contains bad input.
  if (!mongoose.isValidObjectId(articleId)) {
    return [];
  }

  // Group events by day and publication version for the analytics chart.
  return ViewEvent.aggregate([
    { $match: { article: new mongoose.Types.ObjectId(articleId) } },
    {
      $group: {
        _id: { day: "$dayKey", publicationVersion: "$publicationVersion" },
        views: { $sum: 1 }
      }
    },
    { $sort: { "_id.day": 1 } }
  ]);
};

// Return total views per day so the Impact Analytics graph can draw one clear line.
const getArticleDailyViews = async (articleId) => {
  // Avoid an invalid ObjectId exception when the URL contains bad input.
  if (!mongoose.isValidObjectId(articleId)) {
    return [];
  }

  // Group the small pre-indexed events instead of scanning raw request logs.
  const groups = await ViewEvent.aggregate([
    { $match: { article: new mongoose.Types.ObjectId(articleId) } },
    { $group: { _id: "$dayKey", views: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  // Flatten the aggregation shape into simple chart-ready points.
  return groups.map((group) => ({ day: group._id, views: group.views }));
};

module.exports = { recordArticleView, getArticleTimeline, getArticleDailyViews, createDayKey, hashClientKey };
