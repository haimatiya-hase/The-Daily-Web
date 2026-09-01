const mongoose = require("mongoose");

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

viewEventSchema.index({ article: 1, viewedAt: 1 });
viewEventSchema.index({ article: 1, dayKey: 1 });

module.exports = mongoose.model("ViewEvent", viewEventSchema);
