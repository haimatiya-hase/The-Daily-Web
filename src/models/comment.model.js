// Load Mongoose for comment documents and article references.
const mongoose = require("mongoose");

// Store guest comments and a hashed client key for rate limiting.
const commentSchema = new mongoose.Schema({
  // Link the comment to the article that receives it.
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
    index: true
  },
  // Store the public name selected by the guest reader.
  guestName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  // Store the text of the guest comment.
  body: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000
  },
  // Store only a hash for rate-limit checks by anonymous clients.
  clientKeyHash: {
    type: String,
    required: true,
    index: true
  },
  // Use soft deletion so moderation does not remove history from the database.
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Make article lists and one-minute checks efficient.
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ clientKeyHash: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
