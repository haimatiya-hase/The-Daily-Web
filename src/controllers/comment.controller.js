// Load Mongoose, the article model, the shared error class, the logger, the device-key helper, and the comment service.
const mongoose = require("mongoose");
const Article = require("../models/article.model");
const HttpError = require("../utils/http-error");
const logger = require("../utils/logger");
const { readClientKey } = require("../utils/client-key");
const commentService = require("../services/comment.service");

// Confirm that an article is public before exposing or accepting its comments.
const findPublishedArticleId = async (articleId) => {
  // Reject malformed identifiers before they reach MongoDB.
  if (!mongoose.isValidObjectId(articleId)) {
    return null;
  }

  // Match only articles that already have an approved public version.
  const article = await Article.findOne({ _id: articleId, "publishedVersion.publishedAt": { $ne: null } })
    .select("_id")
    .lean();

  return article ? article._id : null;
};

// Reject a malformed comment id with the same 404 used for missing comments.
const requireCommentId = (commentId) => {
  if (!mongoose.isValidObjectId(commentId)) {
    throw new HttpError(404, "התגובה לא נמצאה.");
  }

  return commentId;
};

// Return one page of visible comments for a public article.
const listComments = async (req, res, next) => {
  try {
    const articleId = await findPublishedArticleId(req.params.articleId);

    if (!articleId) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Continue after the cursor sent by the load-more button.
    const page = await commentService.listArticleComments(articleId, { cursor: req.query.cursor });

    res.json({
      comments: page.comments,
      pagination: {
        pageSize: commentService.COMMENT_PAGE_SIZE,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create one guest comment through AJAX without reloading the page.
const createComment = async (req, res, next) => {
  try {
    const articleId = await findPublishedArticleId(req.params.articleId);

    // Allow comments only on articles that readers can actually see.
    if (!articleId) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Validate, rate limit, and store the comment inside the service.
    const comment = await commentService.createGuestComment({
      articleId,
      payload: req.body,
      clientKey: readClientKey(req)
    });

    // Keep a normal operational log line without the comment text or the device key.
    logger.info("Guest comment created", { articleId: String(articleId), commentId: String(comment.id) });

    // Return the stored comment so the browser can show it immediately.
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
};

// Render the editor moderation page shell; the queue itself loads through AJAX.
const showModerationPage = (req, res) => {
  res.render("pages/comments", {
    pageTitle: "ניהול תגובות",
    activePage: "comments",
    user: req.user,
    // Give the template the accepted filters so the dropdown and the API stay in sync.
    moderationStatuses: commentService.MODERATION_STATUSES
  });
};

// Return one page of the moderation queue with search and visibility filters.
const listModerationQueue = async (req, res, next) => {
  try {
    const page = await commentService.listCommentsForModeration({
      search: req.query.search,
      status: req.query.status,
      cursor: req.query.cursor
    });

    res.json({
      items: page.comments,
      total: page.total,
      pagination: {
        pageSize: commentService.MODERATION_PAGE_SIZE,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor
      },
      filters: page.filters
    });
  } catch (error) {
    next(error);
  }
};

// Let an editor correct one comment.
const updateComment = async (req, res, next) => {
  try {
    const commentId = requireCommentId(req.params.commentId);
    const comment = await commentService.updateCommentBody(commentId, req.body?.body, req.user._id);

    // Record moderation as an operational event with the acting editor.
    logger.info("Comment edited by editor", { commentId, editorId: String(req.user._id) });

    res.json({ comment });
  } catch (error) {
    next(error);
  }
};

// Let an editor hide one comment with soft deletion.
const deleteComment = async (req, res, next) => {
  try {
    const commentId = requireCommentId(req.params.commentId);
    const comment = await commentService.softDeleteComment(commentId, req.user._id);

    logger.info("Comment hidden by editor", { commentId, editorId: String(req.user._id) });

    // Return the hidden comment so the moderation screen can show its new state.
    res.json({ comment });
  } catch (error) {
    next(error);
  }
};

// Let an editor make one hidden comment visible again.
const restoreComment = async (req, res, next) => {
  try {
    const commentId = requireCommentId(req.params.commentId);
    const comment = await commentService.restoreComment(commentId, req.user._id);

    logger.info("Comment restored by editor", { commentId, editorId: String(req.user._id) });

    res.json({ comment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listComments,
  createComment,
  showModerationPage,
  listModerationQueue,
  updateComment,
  deleteComment,
  restoreComment
};
