// Load Mongoose for view event documents.
const mongoose = require("mongoose");

// Store one event so analytics can group views over time.
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
    default: Date.now,
    index: true
  },
  // Store the day group used by the timeline aggregation.
  dayKey: {
    type: String,
    required: true,
    index: true
  }
}, { timestamps: true });

// Index the timeline query used by Impact Analytics.
viewEventSchema.index({ article: 1, viewedAt: 1 });
viewEventSchema.index({ article: 1, dayKey: 1 });

module.exports = mongoose.model("ViewEvent", viewEventSchema);
