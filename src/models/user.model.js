const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 40,
    lowercase: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["reporter", "editor"],
    required: true
  }
}, { timestamps: true });

userSchema.methods.toJSON = function toJSON() {
  const value = this.toObject();
  delete value.passwordHash;
  return value;
};

module.exports = mongoose.model("User", userSchema);
