// Load Mongoose for pre-aggregated view statistics.
const mongoose = require("mongoose");

// Store one document per article per hour so charts never scan raw view events.
const viewStatSchema = new mongoose.Schema({
  // Link the bucket to the article that was viewed.
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
    index: true
  },
  // Store the start of the UTC hour that this bucket covers.
  bucketStart: {
    type: Date,
    required: true
  },
  // Count every view that fell inside this hour.
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  // Count the views of each public version separately so updates can be compared.
  byVersion: {
    type: Map,
    of: Number,
    default: {}
  }
}, { timestamps: true });

// Let one atomic upsert per view find its bucket and prevent duplicates for the same hour.
viewStatSchema.index({ article: 1, bucketStart: 1 }, { unique: true });
// Support recent-activity queries across all articles.
viewStatSchema.index({ bucketStart: 1 });

module.exports = mongoose.model("ViewStat", viewStatSchema);
