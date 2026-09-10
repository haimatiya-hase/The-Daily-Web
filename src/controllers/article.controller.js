// Load Mongoose, the article model, the shared error class, the device-key helper, and the article-page services.
const mongoose = require("mongoose");
const Article = require("../models/article.model");
const HttpError = require("../utils/http-error");
const logger = require("../utils/logger");
const { ensureDeviceKey } = require("../utils/client-key");
const commentService = require("../services/comment.service");
const { recordArticleView } = require("../services/view.service");

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

    // Read the first comment page and the full count together so both are part of the first HTML response.
    const [commentPage, commentsTotal] = await Promise.all([
      commentService.listArticleComments(article._id),
      commentService.countArticleComments(article._id)
    ]);
    // Use only the approved public version for every rendered field.
    const published = article.publishedVersion;

    // Count this entry on the server so every visit is recorded even without browser JavaScript.
    try {
      await recordArticleView({
        articleId: article._id,
        publicationVersion: Number(published.versionNumber) || 1,
        // Identify the device with a first-party cookie that is created on the first visit.
        clientKey: ensureDeviceKey(req, res),
        userAgent: req.get("User-Agent")
      });
    } catch (error) {
      // Never fail the article page because statistics could not be written.
      logger.warn("Article view was not recorded", { articleId: String(article._id), message: error.message });
    }

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
      comments: commentPage.comments.map((comment) => ({
        ...comment,
        createdAtText: formatDate(comment.createdAt, commentDateFormat)
      })),
      // Show the real total even when only the first page is rendered.
      commentsTotal,
      // Let the load-more button continue exactly after the rendered page.
      commentsNextCursor: commentPage.nextCursor
    });
  } catch (error) {
    // Let the shared middleware render the safe error page.
    next(error);
  }
};

module.exports = { showArticle };
