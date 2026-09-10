// Load Mongoose, the comment model, the shared error class, the logger, and the device-key hash helper.
const mongoose = require("mongoose");
const Comment = require("../models/comment.model");
const HttpError = require("../utils/http-error");
const logger = require("../utils/logger");
const { hashClientKey } = require("../utils/client-key");

// Keep validation limits equal to the comment schema limits.
const COMMENT_LIMITS = Object.freeze({ guestName: 80, body: 2000 });
// Allow at most three guest comments per minute from one device, as required by the assignment.
const COMMENT_RATE_LIMIT = Object.freeze({ maxPerWindow: 3, windowMs: 60 * 1000 });
// Load public comment threads twenty at a time so long threads stay fast.
const COMMENT_PAGE_SIZE = 20;
// Load the moderation queue in slightly larger pages because editors scan quickly.
const MODERATION_PAGE_SIZE = 25;
// Accept only the three visibility filters shown by the moderation screen.
const MODERATION_STATUSES = Object.freeze(["visible", "deleted", "all"]);
// Keep search text short so the text index query stays cheap.
const MAX_SEARCH_LENGTH = 100;

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

// Validate only the body when an editor corrects an existing comment.
const validateModeratedBody = (body) => {
  // Reuse the same trimming rules that guests must follow.
  const cleanBody = cleanText(body);

  if (!cleanBody) {
    throw new HttpError(400, "לא ניתן לשמור תגובה ריקה.");
  }

  if (cleanBody.length > COMMENT_LIMITS.body) {
    throw new HttpError(400, `התגובה יכולה להכיל עד ${COMMENT_LIMITS.body} תווים.`);
  }

  return cleanBody;
};

// Block the fourth comment inside one minute from the same anonymous device.
const assertCommentRateLimit = async (clientKeyHash) => {
  // Look back exactly one rate-limit window from the current moment.
  const windowStart = new Date(Date.now() - COMMENT_RATE_LIMIT.windowMs);
  // Count only recent comments from this hashed device key using the matching index.
  const recentCount = await Comment.countDocuments({ clientKeyHash, createdAt: { $gte: windowStart } });

  // Return a clear server-side error so the browser can show the required message.
  if (recentCount >= COMMENT_RATE_LIMIT.maxPerWindow) {
    // Record the blocked attempt because repeated blocks are an operational signal worth watching.
    logger.warn("Guest comment blocked by rate limit", { clientKeyHash, recentCount });
    throw new HttpError(429, "ניתן לפרסם עד 3 תגובות בדקה מאותו מכשיר. נסו שוב בעוד רגע.");
  }
};

// Turn the last comment of a page into a URL-safe cursor for the next page.
const createCursor = (comment) => {
  // Store the two sort keys so the next page can continue after this exact comment.
  const values = { createdAt: new Date(comment.createdAt).toISOString(), id: String(comment._id) };
  return Buffer.from(JSON.stringify(values)).toString("base64url");
};

// Read and validate a cursor received from the browser.
const readCursor = (value) => {
  // Treat a missing cursor as the first page.
  if (!value) {
    return null;
  }

  try {
    // Reject unusually long values before decoding them.
    if (String(value).length > 300) {
      throw new Error("Cursor is too long.");
    }

    // Decode the stored sort keys.
    const values = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(values.createdAt);

    // Reject cursors whose keys cannot be used in a safe range query.
    if (!mongoose.isValidObjectId(values.id) || Number.isNaN(createdAt.getTime())) {
      throw new Error("Cursor keys are not valid.");
    }

    return { createdAt, id: new mongoose.Types.ObjectId(values.id) };
  } catch (error) {
    // Tell the caller that the browser sent a malformed cursor.
    throw new HttpError(400, "מצביע הדפדוף אינו תקין.");
  }
};

// Add the next-page range to an existing MongoDB filter.
const addCursorFilter = (filter, cursor) => {
  // Leave the first-page filter unchanged when there is no cursor.
  if (!cursor) {
    return filter;
  }

  // Continue strictly after the previous comment using both sort keys.
  return {
    ...filter,
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
    ]
  };
};

// Return only the fields that belong in a public response.
const toPublicComment = (comment) => ({
  id: comment._id,
  guestName: comment.guestName,
  body: comment.body,
  createdAt: comment.createdAt
});

// Return the fields that the moderation screen needs, including article context.
const toModerationComment = (comment) => {
  // Read the populated article when it is available and fall back to the bare id.
  const article = comment.article && typeof comment.article === "object" ? comment.article : null;

  return {
    id: comment._id,
    guestName: comment.guestName,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    deletedAt: comment.deletedAt || null,
    moderatedAt: comment.moderatedAt || null,
    article: {
      id: String(article ? article._id : comment.article),
      // Prefer the public title and fall back to the working title for unpublished articles.
      title: article?.publishedVersion?.title || article?.workingVersion?.title || "כתבה ללא כותרת"
    }
  };
};

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

// Read one page of visible comments for the public article page and its load-more button.
const listArticleComments = async (articleId, { cursor } = {}) => {
  // Start from the visible comments of this article and continue after the cursor when given.
  const filter = addCursorFilter({ article: articleId, deletedAt: null }, readCursor(cursor));

  // Read one extra comment so the caller can tell whether another page exists.
  const comments = await Comment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(COMMENT_PAGE_SIZE + 1)
    .lean();

  // Keep exactly one page and build the cursor from its last comment.
  const hasMore = comments.length > COMMENT_PAGE_SIZE;
  const page = comments.slice(0, COMMENT_PAGE_SIZE);

  return {
    comments: page.map(toPublicComment),
    hasMore,
    nextCursor: hasMore ? createCursor(page[page.length - 1]) : null
  };
};

// Count the visible comments of one article for the heading counter.
const countArticleComments = (articleId) => Comment.countDocuments({ article: articleId, deletedAt: null });

// Read one page of the moderation queue with search and visibility filters.
const listCommentsForModeration = async ({ search, status, cursor } = {}) => {
  // Accept only a known visibility filter and default to visible comments.
  const visibility = MODERATION_STATUSES.includes(status) ? status : "visible";
  // Limit search text so the text index query stays cheap.
  const cleanSearch = cleanText(search).slice(0, MAX_SEARCH_LENGTH);
  const filter = {};

  // Translate the visibility filter into the soft-deletion field.
  if (visibility === "visible") {
    filter.deletedAt = null;
  } else if (visibility === "deleted") {
    filter.deletedAt = { $ne: null };
  }

  // Search comment text and guest names through the text index.
  if (cleanSearch) {
    filter.$text = { $search: cleanSearch };
  }

  // Count the whole result before the cursor narrows it to one page.
  const [comments, total] = await Promise.all([
    Comment.find(addCursorFilter(filter, readCursor(cursor)))
      .populate("article", "publishedVersion.title workingVersion.title")
      .sort({ createdAt: -1, _id: -1 })
      .limit(MODERATION_PAGE_SIZE + 1)
      .lean(),
    Comment.countDocuments(filter)
  ]);

  // Keep exactly one page and build the cursor from its last comment.
  const hasMore = comments.length > MODERATION_PAGE_SIZE;
  const page = comments.slice(0, MODERATION_PAGE_SIZE);

  return {
    comments: page.map(toModerationComment),
    total,
    hasMore,
    nextCursor: hasMore ? createCursor(page[page.length - 1]) : null,
    filters: { search: cleanSearch, status: visibility }
  };
};

// Apply one moderation change and return the updated comment or a clear 404.
const applyModeration = async (filter, update, editorId) => {
  // Record who moderated and when together with the requested change.
  const comment = await Comment.findOneAndUpdate(
    filter,
    { $set: { ...update, moderatedBy: editorId, moderatedAt: new Date() } },
    { new: true }
  )
    .populate("article", "publishedVersion.title workingVersion.title")
    .lean();

  if (!comment) {
    throw new HttpError(404, "התגובה לא נמצאה.");
  }

  return toModerationComment(comment);
};

// Let an editor correct the text of one visible comment.
const updateCommentBody = async (commentId, body, editorId) => {
  // Validate the new text before touching the database.
  const cleanBody = validateModeratedBody(body);
  // Change only a comment that still exists and was not hidden.
  return applyModeration({ _id: commentId, deletedAt: null }, { body: cleanBody }, editorId);
};

// Hide one comment with soft deletion so moderation keeps database history.
const softDeleteComment = async (commentId, editorId) => {
  // Mark the deletion time instead of removing the document.
  return applyModeration({ _id: commentId, deletedAt: null }, { deletedAt: new Date() }, editorId);
};

// Make one hidden comment visible again.
const restoreComment = async (commentId, editorId) => {
  // Restore only a comment that is currently hidden.
  return applyModeration({ _id: commentId, deletedAt: { $ne: null } }, { deletedAt: null }, editorId);
};

module.exports = {
  COMMENT_LIMITS,
  COMMENT_RATE_LIMIT,
  COMMENT_PAGE_SIZE,
  MODERATION_PAGE_SIZE,
  MODERATION_STATUSES,
  validateCommentInput,
  assertCommentRateLimit,
  createCursor,
  readCursor,
  createGuestComment,
  listArticleComments,
  countArticleComments,
  listCommentsForModeration,
  updateCommentBody,
  softDeleteComment,
  restoreComment
};
