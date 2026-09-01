// Load Mongoose for comment documents and article references.
const mongoose = require("mongoose");

// Store guest comments and a hashed client key for rate limiting.
const commentSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
    index: true
  },
  guestName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  body: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000
  },
  clientKeyHash: {
    type: String,
    required: true,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Make article lists and one-minute checks efficient.
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ clientKeyHash: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
