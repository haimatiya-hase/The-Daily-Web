const mongoose = require("mongoose");

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

commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ clientKeyHash: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
