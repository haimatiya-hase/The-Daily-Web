// Load the logger and the image storage service.
const logger = require("../utils/logger");
const { saveImage } = require("../services/upload.service");

// Store one image sent as a raw request body and return its public address.
const uploadImage = async (req, res, next) => {
  try {
    // Validate and store the image; the service reports clear errors for bad input.
    const stored = await saveImage({
      buffer: req.body,
      declaredType: String(req.get("Content-Type") || "").split(";")[0].trim().toLowerCase()
    });

    // Keep an operational log line so uploads can be traced without exposing the file.
    logger.info("Image uploaded", { fileName: stored.fileName, size: stored.size, userId: String(req.user._id) });

    // Return the address that the article form stores as its image URL.
    res.status(201).json({ imageUrl: stored.imageUrl });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadImage };
