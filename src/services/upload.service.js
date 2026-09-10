// Load the file system, path, and random-name helpers used to store uploaded images.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const HttpError = require("../utils/http-error");

// Keep uploaded images small enough for a news site while allowing normal photos.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Accept only common browser image formats and map each one to its file extension.
const ALLOWED_IMAGE_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
});
// Store uploads inside the public folder so Express static serving publishes them.
const DEFAULT_UPLOAD_DIR = path.join(__dirname, "../../public/uploads");
// Serve every stored image under this URL prefix.
const PUBLIC_UPLOAD_PREFIX = "/uploads";

// Detect the real image format from the first bytes instead of trusting the request header.
const detectImageType = (buffer) => {
  // Every supported format needs at least twelve bytes for its signature.
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG files always start with FF D8 FF.
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG files start with the fixed eight-byte signature.
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  // GIF files start with GIF87a or GIF89a.
  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  // WebP files are RIFF containers whose type field says WEBP.
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  return null;
};

// Validate one uploaded image and store it under a random name.
const saveImage = async ({ buffer, declaredType, uploadDir = DEFAULT_UPLOAD_DIR }) => {
  // Reject requests whose body was not parsed as binary image data.
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, "לא התקבל קובץ תמונה.");
  }

  // Reject files above the limit even when the body parser accepted them.
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "התמונה גדולה מדי. ניתן להעלות עד 5MB.");
  }

  // Reject formats that the site does not accept.
  const extension = ALLOWED_IMAGE_TYPES[declaredType];
  if (!extension) {
    throw new HttpError(415, "ניתן להעלות רק תמונות מסוג JPG, PNG, WebP או GIF.");
  }

  // Reject files whose content does not match the declared image format.
  if (detectImageType(buffer) !== declaredType) {
    throw new HttpError(415, "תוכן הקובץ אינו תואם לסוג התמונה שנשלח.");
  }

  // Generate a random name so uploads never collide and never use the original file name.
  const fileName = `${crypto.randomBytes(16).toString("hex")}.${extension}`;

  // Create the upload folder on first use and refuse to overwrite an existing file.
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, fileName), buffer, { flag: "wx" });

  return {
    imageUrl: `${PUBLIC_UPLOAD_PREFIX}/${fileName}`,
    fileName,
    size: buffer.length,
    type: declaredType
  };
};

module.exports = {
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_TYPES,
  DEFAULT_UPLOAD_DIR,
  PUBLIC_UPLOAD_PREFIX,
  detectImageType,
  saveImage
};
