// Load Mongoose, the article model, the shared error class, and the article-page services.
const mongoose = require("mongoose");
const Article = require("../models/article.model");
const HttpError = require("../utils/http-error");
const commentService = require("../services/comment.service");
const { recordArticleView, getArticleDailyViews } = require("../services/analytics.service");

// Reuse one Hebrew date formatter for article metadata.
const publishedDateFormat = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" });
// Reuse one Hebrew date-and-time formatter for comment timestamps.
const commentDateFormat = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

// Format one date safely for server-rendered Hebrew text.
const formatDate = (value, formatter) => {
  // Convert the stored value into a real date before formatting.
  const date = new Date(value);
  // Hide invalid dates instead of rendering broken text.
  return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
};

// Identify the requesting device with the anonymous browser key or a network fallback.
const readClientKey = (req) => {
  // Prefer the anonymous localStorage key that the browser sends in a header.
  const headerKey = String(req.get?.("X-Client-Key") || "").trim().slice(0, 100);
  // Fall back to the request address so the comment limit still works without browser storage.
  return headerKey || `ip:${req.ip || "unknown"}`;
};

// Read one approved article with only its public fields.
const findPublishedArticle = async (articleId, selectedFields) => {
  // Reject malformed identifiers before they reach MongoDB.
  if (!mongoose.isValidObjectId(articleId)) {
    return null;
  }

  // Match only articles that already have an approved public version.
  return Article.findOne({ _id: articleId, "publishedVersion.publishedAt": { $ne: null } })
    .select(selectedFields)
    .populate("author", "displayName")
    .lean();
};

// Render the public article page with the full approved content in the initial HTML.
const showArticle = async (req, res, next) => {
  try {
    // Read the approved snapshot, its author, and the popularity counter.
    const article = await findPublishedArticle(req.params.articleId, "author viewCount publishedVersion");

    // Return a friendly 404 page when the article is missing or not public yet.
    if (!article) {
      throw new HttpError(404, "הכתבה המבוקשת לא נמצאה או שעדיין לא פורסמה.");
    }

    // Read the newest visible comments so the list is part of the first HTML response.
    const comments = await commentService.listArticleComments(article._id);
    // Use only the approved public version for every rendered field.
    const published = article.publishedVersion;

    // Render the complete article so search engines do not depend on browser JavaScript.
    res.render("pages/article", {
      // Use the approved headline as the browser tab title.
      pageTitle: published.title,
      // Keep the shared navigation state.
      activePage: "article",
      article: {
        // Give the browser script the identifier used by the comment and view APIs.
        id: String(article._id),
        title: published.title,
        summary: published.summary,
        // Split the stored text into paragraphs so the template can escape each one.
        paragraphs: String(published.content || "").split(/\r?\n+/).filter((paragraph) => paragraph.trim()),
        imageUrl: published.imageUrl,
        category: published.category,
        publishedAt: published.publishedAt,
        // Send a ready Hebrew date so the page needs no client-side formatting.
        publishedAtText: formatDate(published.publishedAt, publishedDateFormat),
        // Tell the view beacon which public version received this visit.
        publicationVersion: Number(published.versionNumber) || 1,
        // Use a safe fallback when the author account is unavailable.
        authorName: article.author?.displayName || "מערכת The Daily Web",
        viewCount: article.viewCount || 0
      },
      // Add a formatted time to each server-rendered comment.
      comments: comments.map((comment) => ({
        ...comment,
        createdAtText: formatDate(comment.createdAt, commentDateFormat)
      }))
    });
  } catch (error) {
    // Let the shared middleware render the safe error page.
    next(error);
  }
};

// Record one article visit for the view statistics.
const recordView = async (req, res, next) => {
  try {
    // Read only the version number needed to label the view event.
    const article = await findPublishedArticle(req.params.articleId, "publishedVersion.versionNumber");

    // Refuse to count views for articles that are not public.
    if (!article) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Store the event and update the popularity counter through the analytics service.
    await recordArticleView({
      articleId: article._id,
      publicationVersion: Number(article.publishedVersion?.versionNumber) || 1,
      clientKey: readClientKey(req)
    });

    // Return an empty success because the beacon needs no response body.
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// Return the visible comments of one public article as JSON.
const listComments = async (req, res, next) => {
  try {
    // Confirm the article is public before exposing its comments.
    const article = await findPublishedArticle(req.params.articleId, "_id");

    if (!article) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Send the newest visible comments in the shared public shape.
    res.json({ comments: await commentService.listArticleComments(article._id) });
  } catch (error) {
    next(error);
  }
};

// Create one guest comment through AJAX without reloading the page.
const createComment = async (req, res, next) => {
  try {
    // Allow comments only on articles that readers can actually see.
    const article = await findPublishedArticle(req.params.articleId, "_id");

    if (!article) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Validate, rate limit, and store the comment inside the service.
    const comment = await commentService.createGuestComment({
      articleId: article._id,
      payload: req.body,
      clientKey: readClientKey(req)
    });

    // Return the stored comment so the browser can show it immediately.
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
};

// Let an editor correct one comment as part of full comment CRUD.
const updateComment = async (req, res, next) => {
  try {
    // Reject malformed identifiers before querying MongoDB.
    if (!mongoose.isValidObjectId(req.params.commentId)) {
      throw new HttpError(404, "התגובה לא נמצאה.");
    }

    // Save the moderated text and return the updated public shape.
    res.json({ comment: await commentService.updateCommentBody(req.params.commentId, req.body?.body) });
  } catch (error) {
    next(error);
  }
};

// Let an editor hide one comment with soft deletion.
const deleteComment = async (req, res, next) => {
  try {
    // Reject malformed identifiers before querying MongoDB.
    if (!mongoose.isValidObjectId(req.params.commentId)) {
      throw new HttpError(404, "התגובה לא נמצאה.");
    }

    // Mark the comment as deleted while keeping database history.
    await commentService.softDeleteComment(req.params.commentId);
    // Return an empty success because the browser only removes the item.
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// Return the Impact Analytics data of one article for the editor graph.
const getArticleAnalytics = async (req, res, next) => {
  try {
    // Reject malformed identifiers before querying MongoDB.
    if (!mongoose.isValidObjectId(req.params.articleId)) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Read only the fields needed to describe the graph and its markers.
    const article = await Article.findById(req.params.articleId)
      .select("workingVersion.title publishedVersion.title publishedVersion.versionNumber publishedVersion.publishedAt publicationHistory viewCount")
      .lean();

    if (!article) {
      throw new HttpError(404, "הכתבה לא נמצאה.");
    }

    // Prefer the recorded history and fall back to the single known publication for older records.
    const markers = (article.publicationHistory?.length
      ? article.publicationHistory
      : [article.publishedVersion].filter((version) => version?.publishedAt)
    ).map((entry) => ({
      versionNumber: Number(entry.versionNumber) || 1,
      publishedAt: entry.publishedAt
    }));

    // Send the daily totals and publication markers used by the canvas chart.
    res.json({
      article: {
        id: String(article._id),
        title: article.publishedVersion?.title || article.workingVersion?.title || "ללא כותרת",
        totalViews: article.viewCount || 0
      },
      timeline: await getArticleDailyViews(req.params.articleId),
      markers
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  showArticle,
  recordView,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  getArticleAnalytics
};
