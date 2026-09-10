// Load Express, the upload controller, the role guard, the error class, and the upload limits.
const express = require("express");
const uploadController = require("../controllers/upload.controller");
const { requireRole } = require("../middleware/auth.middleware");
const HttpError = require("../utils/http-error");
const { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } = require("../services/upload.service");

// Keep image upload endpoints in one staff-only router.
const router = express.Router();

// Parse the raw image body with the built-in Express parser instead of an external upload library.
const rawImageParser = express.raw({ type: Object.keys(ALLOWED_IMAGE_TYPES), limit: MAX_IMAGE_BYTES });

// Translate parser failures such as an oversized body into the shared Hebrew error format.
const parseImageBody = (req, res, next) => {
  rawImageParser(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    // Report the size limit clearly and keep other parser problems as a normal client error.
    next(error.type === "entity.too.large"
      ? new HttpError(413, "התמונה גדולה מדי. ניתן להעלות עד 5MB.")
      : new HttpError(400, "לא ניתן לקרוא את קובץ התמונה."));
  });
};

// Let reporters and editors upload one image from their computer.
router.post("/images", requireRole("reporter", "editor"), parseImageBody, uploadController.uploadImage);

module.exports = router;
