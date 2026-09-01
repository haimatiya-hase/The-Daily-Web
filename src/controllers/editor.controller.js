// Load Mongoose, the article model, and editor workflow rules.
const mongoose = require("mongoose");
const Article = require("../models/article.model");
const HttpError = require("../utils/http-error");
const {
  ARTICLE_STATUSES,
  applyEditorEdit,
  approveArticle,
  requestChanges
} = require("../services/article-workflow.service");

// Render the editor workspace for an authenticated editor.
function showEditorDashboard(req, res) {
  // Pass the logged-in editor to the page so the header can show the account.
  res.render("pages/editor", {
    pageTitle: "אזור עורך",
    activePage: "editor",
    user: req.user
  });
}

// Escape search text before it becomes a MongoDB regular expression.
function escapeRegex(value) {
  // Escape special characters so search text stays a normal text search.
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert query text into a safe positive integer.
function readPositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

// Return only article data that the editor screen needs.
function serializeArticle(article) {
  // Support both Mongoose documents and plain objects returned by lean queries.
  const value = article.toObject ? article.toObject() : article;

  if (value.author && typeof value.author === "object") {
    // Return only safe author fields instead of the full populated document.
    value.author = {
      id: String(value.author._id || value.author.id),
      displayName: value.author.displayName,
      username: value.author.username
    };
  }

  return value;
}

// Find one article by ID and give a clear error for malformed IDs.
async function findArticle(articleId) {
  if (!mongoose.isValidObjectId(articleId)) {
    throw new HttpError(400, "The article ID is not valid.");
  }

  const article = await Article.findById(articleId)
    .populate("author", "displayName username")
    .exec();

  if (!article) {
    throw new HttpError(404, "Article was not found.");
  }

  return article;
}

// List all articles for the editor queue with simple search and status filters.
async function listArticles(req, res, next) {
  try {
    // Read filters from the query string and apply safe default pagination.
    const status = String(req.query.status || "").trim();
    const search = String(req.query.search || "").trim();
    const page = readPositiveInteger(req.query.page, 1);
    const limit = Math.min(readPositiveInteger(req.query.limit, 20), 50);
    const filter = {};

    // Accept only known statuses from the filter dropdown.
    if (status) {
      if (!Object.values(ARTICLE_STATUSES).includes(status)) {
        throw new HttpError(400, "The article status filter is not valid.");
      }

      filter.status = status;
    }

    // Search both the working title and the currently published title.
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { "workingVersion.title": { $regex: safeSearch, $options: "i" } },
        { "publishedVersion.title": { $regex: safeSearch, $options: "i" } }
      ];
    }

    // Load the current page and the total count at the same time.
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .populate("author", "displayName username")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      Article.countDocuments(filter).exec()
    ]);

    // Return a predictable response that the editor browser code can render.
    res.json({
      items: articles.map(serializeArticle),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

// Return the selected article with both working and published versions.
async function getArticle(req, res, next) {
  try {
    // Load one article only after validating its MongoDB identifier.
    const article = await findArticle(req.params.articleId);
    // Send both the editable and public versions to the editor.
    res.json({ article: serializeArticle(article) });
  } catch (error) {
    next(error);
  }
}

// Save an editor correction without publishing it automatically.
async function updateArticle(req, res, next) {
  try {
    // Find the article before applying the workflow service rules.
    const article = await findArticle(req.params.articleId);
    // Validate and save an editor correction without publishing it.
    applyEditorEdit(article, req.body, req.user._id, new Date());
    await article.save();
    res.json({ article: serializeArticle(article) });
  } catch (error) {
    next(error);
  }
}

// Approve the working version and make it visible to readers.
async function publishArticle(req, res, next) {
  try {
    // Find the article before changing its public state.
    const article = await findArticle(req.params.articleId);
    // Move the approved working version into the public version field.
    approveArticle(article, req.user._id, new Date());
    await article.save();
    res.json({ article: serializeArticle(article) });
  } catch (error) {
    next(error);
  }
}

// Send a pending article back to the reporter with a required note.
async function requestArticleChanges(req, res, next) {
  try {
    // Find the article before recording the editor's correction note.
    const article = await findArticle(req.params.articleId);
    // The workflow service validates that a useful note was supplied.
    requestChanges(article, req.user._id, req.body.note, new Date());
    await article.save();
    res.json({ article: serializeArticle(article) });
  } catch (error) {
    next(error);
  }
}

// Delete any article because an editor owns content administration.
async function deleteArticle(req, res, next) {
  try {
    // Confirm that the article exists before deleting it.
    await findArticle(req.params.articleId);
    // Editors are allowed to remove any article from the content system.
    await Article.findByIdAndDelete(req.params.articleId).exec();
    res.json({ deleted: true, articleId: req.params.articleId });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  showEditorDashboard,
  listArticles,
  getArticle,
  updateArticle,
  publishArticle,
  requestArticleChanges,
  deleteArticle
};
