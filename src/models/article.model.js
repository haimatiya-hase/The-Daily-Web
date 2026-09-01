// Load Mongoose for article documents and references.
const mongoose = require("mongoose");

// Keep editable content separate from the last approved public content.
const articleSnapshotSchema = new mongoose.Schema({
  versionNumber: { type: Number, required: true, default: 1 },
  title: { type: String, trim: true, maxlength: 180 },
  summary: { type: String, trim: true, maxlength: 500 },
  content: { type: String, trim: true },
  imageUrl: { type: String, trim: true, maxlength: 1000 },
  category: { type: String, trim: true, maxlength: 80 },
  createdAt: { type: Date },
  submittedAt: { type: Date },
  publishedAt: { type: Date },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: false });

// Store ownership, workflow status, versions, and counters.
const articleSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ["draft", "pending_review", "published", "changes_requested"],
    default: "draft",
    index: true
  },
  workingVersion: {
    type: articleSnapshotSchema,
    required: true
  },
  publishedVersion: {
    type: articleSnapshotSchema,
    default: null
  },
  editorNote: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  lastEditedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  reviewedAt: {
    type: Date
  },
  revisionNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

// Add indexes for public feeds and editor filters.
articleSchema.index({ status: 1, "publishedVersion.publishedAt": -1 });
articleSchema.index({ "publishedVersion.category": 1 });
articleSchema.index({
  "publishedVersion.title": "text",
  "publishedVersion.summary": "text"
});

module.exports = mongoose.model("Article", articleSchema);
