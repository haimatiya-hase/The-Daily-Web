// Load Mongoose for view event documents.
const mongoose = require("mongoose");

// Keep raw events for half a year; hourly buckets keep the long-term history.
const VIEW_EVENT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

// Store one event per view so device-level questions such as "already viewed" can be answered.
const viewEventSchema = new mongoose.Schema({
  // Link the view event to the article that was opened.
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
    index: true
  },
  // Keep the public version number that received this view.
  publicationVersion: {
    type: Number,
    required: true,
    min: 1
  },
  // Keep the optional anonymous client hash for privacy-safe analysis.
  clientKeyHash: {
    type: String,
    required: false,
    select: false
  },
  // Store the exact time when the article was viewed.
  viewedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Store the day group used by simple daily reports.
  dayKey: {
    type: String,
    required: true,
    index: true
  }
}, { timestamps: true });

// Serve per-article time queries and the rebuild aggregation.
viewEventSchema.index({ article: 1, viewedAt: 1 });
viewEventSchema.index({ article: 1, dayKey: 1 });
// Find the unique articles viewed by one anonymous browser without scanning all events.
viewEventSchema.index({ clientKeyHash: 1, article: 1 }, { sparse: true });
// Let MongoDB expire old raw events automatically so storage stays bounded under heavy traffic.
viewEventSchema.index({ viewedAt: 1 }, { expireAfterSeconds: VIEW_EVENT_RETENTION_SECONDS });

module.exports = mongoose.model("ViewEvent", viewEventSchema);
module.exports.VIEW_EVENT_RETENTION_SECONDS = VIEW_EVENT_RETENTION_SECONDS;
