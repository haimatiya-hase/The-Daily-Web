// Load Mongoose for view event documents.
const mongoose = require("mongoose");

// Store one event so analytics can group views over time.
const viewEventSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
    index: true
  },
  publicationVersion: {
    type: Number,
    required: true,
    min: 1
  },
  clientKeyHash: {
    type: String,
    required: false,
    select: false
  },
  viewedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
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
