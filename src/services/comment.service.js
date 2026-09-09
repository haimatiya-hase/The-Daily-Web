// Load the comment model, the shared error class, and the anonymous device-key hash helper.
const Comment = require("../models/comment.model");
const HttpError = require("../utils/http-error");
const { hashClientKey } = require("../utils/client-key");

// Keep validation limits equal to the comment schema limits.
const COMMENT_LIMITS = Object.freeze({ guestName: 80, body: 2000 });
// Allow at most three guest comments per minute from one device, as required by the assignment.
const COMMENT_RATE_LIMIT = Object.freeze({ maxPerWindow: 3, windowMs: 60 * 1000 });
// Keep the server-rendered and AJAX comment lists at one safe size.
const COMMENT_PAGE_SIZE = 50;

// Convert any input into clean trimmed text without failing on missing values.
const cleanText = (value) => (value === undefined || value === null ? "" : String(value).trim());

// Validate and normalize the two fields a guest is allowed to send.
const validateCommentInput = (payload = {}) => {
  // Trim both fields before checking them so spaces cannot pass validation.
  const values = { guestName: cleanText(payload.guestName), body: cleanText(payload.body) };

  // Reject a comment that arrives without a display name.
  if (!values.guestName) {
    throw new HttpError(400, "יש למלא שם לפני שליחת התגובה.");
  }

  // Reject an empty comment body.
  if (!values.body) {
    throw new HttpError(400, "לא ניתן לשלוח תגובה ריקה.");
  }

  // Reject a name longer than the database schema allows.
  if (values.guestName.length > COMMENT_LIMITS.guestName) {
    throw new HttpError(400, `השם יכול להכיל עד ${COMMENT_LIMITS.guestName} תווים.`);
  }

  // Reject a body longer than the database schema allows.
  if (values.body.length > COMMENT_LIMITS.body) {
    throw new HttpError(400, `התגובה יכולה להכיל עד ${COMMENT_LIMITS.body} תווים.`);
  }

  return values;
};

// Block the fourth comment inside one minute from the same anonymous device.
const assertCommentRateLimit = async (clientKeyHash) => {
  // Look back exactly one rate-limit window from the current moment.
  const windowStart = new Date(Date.now() - COMMENT_RATE_LIMIT.windowMs);
  // Count only recent comments from this hashed device key using the matching index.
  const recentCount = await Comment.countDocuments({ clientKeyHash, createdAt: { $gte: windowStart } });

  // Return a clear server-side error so the browser can show the required message.
  if (recentCount >= COMMENT_RATE_LIMIT.maxPerWindow) {
    throw new HttpError(429, "ניתן לפרסם עד 3 תגובות בדקה מאותו מכשיר. נסו שוב בעוד רגע.");
  }
};

// Return only the fields that belong in a public response.
const toPublicComment = (comment) => ({
  id: comment._id,
  guestName: comment.guestName,
  body: comment.body,
  createdAt: comment.createdAt
});

// Create one guest comment after validation and server-side rate limiting.
const createGuestComment = async ({ articleId, payload, clientKey }) => {
  // Validate the guest input before touching the database.
  const values = validateCommentInput(payload);
  // Hash the device key so the original identifier is never stored.
  const clientKeyHash = hashClientKey(clientKey);
  // Enforce the spam limit on the server before saving anything.
  await assertCommentRateLimit(clientKeyHash);

  // Store the validated comment connected to its article.
  const comment = await Comment.create({
    article: articleId,
    guestName: values.guestName,
    body: values.body,
    clientKeyHash
  });

  return toPublicComment(comment);
};

// Read the newest visible comments of one article for the page and the API.
const listArticleComments = async (articleId) => {
  // Skip soft-deleted comments and order the newest reactions first.
  const comments = await Comment.find({ article: articleId, deletedAt: null })
    .sort({ createdAt: -1, _id: -1 })
    .limit(COMMENT_PAGE_SIZE)
    .lean();

  return comments.map(toPublicComment);
};

// Let an editor correct the text of one visible comment as a moderation update.
const updateCommentBody = async (commentId, body) => {
  // Reuse the same body rules that guests must follow.
  const cleanBody = cleanText(body);

  if (!cleanBody) {
    throw new HttpError(400, "לא ניתן לשמור תגובה ריקה.");
  }

  if (cleanBody.length > COMMENT_LIMITS.body) {
    throw new HttpError(400, `התגובה יכולה להכיל עד ${COMMENT_LIMITS.body} תווים.`);
  }

  // Change only a comment that still exists and was not soft deleted.
  const comment = await Comment.findOneAndUpdate(
    { _id: commentId, deletedAt: null },
    { $set: { body: cleanBody } },
    { new: true }
  );

  if (!comment) {
    throw new HttpError(404, "התגובה לא נמצאה.");
  }

  return toPublicComment(comment);
};

// Hide one comment with soft deletion so moderation keeps database history.
const softDeleteComment = async (commentId) => {
  // Mark the deletion time instead of removing the document.
  const comment = await Comment.findOneAndUpdate(
    { _id: commentId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true }
  );

  if (!comment) {
    throw new HttpError(404, "התגובה לא נמצאה.");
  }
};

module.exports = {
  COMMENT_LIMITS,
  COMMENT_RATE_LIMIT,
  COMMENT_PAGE_SIZE,
  validateCommentInput,
  assertCommentRateLimit,
  createGuestComment,
  listArticleComments,
  updateCommentBody,
  softDeleteComment
};
