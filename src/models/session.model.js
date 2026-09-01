// Load Mongoose for persistent login sessions.
const mongoose = require("mongoose");

// Store only a session token hash and its expiry date.
const sessionSchema = new mongoose.Schema({
  // Store the hash of the browser token, never the usable token itself.
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Link the session to the authenticated user.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  expiresAt: {
    // Store the exact date when this session stops being valid.
    type: Date,

    // Require an expiry date for every saved session.
    required: true
  }
}, { timestamps: true });

// Let MongoDB remove expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
