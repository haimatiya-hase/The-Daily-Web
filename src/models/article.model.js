// Load Mongoose for article documents and references.
const mongoose = require("mongoose");

// Keep editable content separate from the last approved public content.
const articleSnapshotSchema = new mongoose.Schema({
  // Store the version number used to compare drafts and publications.
  versionNumber: { type: Number, required: true, default: 1 },
  // Store the headline shown in the feed and article page.
  title: { type: String, trim: true, maxlength: 180 },
  // Store the short text shown beside the headline in the feed.
  summary: { type: String, trim: true, maxlength: 500 },
  // Store the full article body.
  content: { type: String, trim: true, maxlength: 20000 }, // Match the editor service limit for one consistent article size.
  // Store the image path or URL used by the article.
  imageUrl: { type: String, trim: true, maxlength: 1000 },
  // Store the category used by filters and display labels.
  category: { type: String, trim: true, maxlength: 80 },
  // Remember when this version was first created.
  createdAt: { type: Date },
  // Remember when the reporter sent this version for review.
  submittedAt: { type: Date },
  // Remember when this version became public.
  publishedAt: { type: Date },
  // Remember when the editor approved this version.
  approvedAt: { type: Date },
  // Link approval to the editor who approved the version.
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: false });

// Store ownership, workflow status, versions, and counters.
const articleSchema = new mongoose.Schema({
  // Mark seed records so the demo script can update only its own data.
  demoKey: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    select: false
  },
  // Link the article to the reporter who owns it.
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  // Keep the article inside the four allowed workflow states.
  status: {
    type: String,
    enum: ["draft", "pending_review", "published", "changes_requested"],
    default: "draft",
    index: true
  },
  // Keep the latest editable content for reporters and editors.
  workingVersion: {
    type: articleSnapshotSchema,
    required: true
  },
  // Keep the last approved content that readers can see.
  publishedVersion: {
    type: articleSnapshotSchema,
    default: null
  },
  // Store the editor's explanation when changes are requested.
  editorNote: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  // Remember the last user who edited the working version.
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // Remember when the working version was last edited.
  lastEditedAt: {
    type: Date
  },
  // Remember the editor who completed the latest review.
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // Remember when the latest review finished.
  reviewedAt: {
    type: Date
  },
  // Count internal revisions without changing publication versions.
  revisionNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  // Keep a quick total for the article analytics summary.
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
