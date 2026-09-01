// Load cryptography, Mongoose, and the view event model.
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const ViewEvent = require("../models/view-event.model");

// Create a stable day key for grouped analytics.
function createDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Hash a client key before it is stored.
function hashClientKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

// Record one article view for later aggregation.
async function recordArticleView({ articleId, publicationVersion, clientKey }) {
  return ViewEvent.create({
    article: articleId,
    publicationVersion,
    dayKey: createDayKey(),
    viewedAt: new Date(),
    clientKeyHash: hashClientKey(clientKey)
  });
}

// Return daily views grouped by publication version.
async function getArticleTimeline(articleId) {
  if (!mongoose.isValidObjectId(articleId)) {
    return [];
  }

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
}

module.exports = { recordArticleView, getArticleTimeline, hashClientKey };
