// Load Mongoose for the user schema.
const mongoose = require("mongoose");

// Keep database roles in one fixed list shared by validation and tests.
const USER_ROLES = Object.freeze(["reporter", "editor"]);

// Store only reporters and editors. Guests are not database users.
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 40,
    lowercase: true,
    // Accept only predictable characters that are safe to type and search.
    match: /^[a-z0-9._-]+$/
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    // Require a visible name instead of an empty or one-letter label.
    minlength: 2,
    maxlength: 80
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    // Reject every stored role except the two authenticated team roles.
    enum: USER_ROLES,
    required: true
  }
}, { timestamps: true });

// Never return the password hash in a JSON response.
userSchema.methods.toJSON = function toJSON() {
  const value = this.toObject();
  delete value.passwordHash;
  return value;
};

// Create the reusable model used by login, sessions, and demo data.
const User = mongoose.model("User", userSchema);

// Export the model normally so existing application imports remain unchanged.
module.exports = User;
// Export the fixed role list for focused validation tests.
module.exports.USER_ROLES = USER_ROLES;
