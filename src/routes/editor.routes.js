// Load Express, the editor controller, and the server-side role guard.
const express = require("express");
const editorController = require("../controllers/editor.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep every editor REST endpoint in one protected router.
const router = express.Router();

// Return the editor queue with optional search and status filters.
router.get("/articles", requireRole("editor"), editorController.listArticles);
// Return the selected article and both of its versions.
router.get("/articles/:articleId", requireRole("editor"), editorController.getArticle);
// Save an editor correction while keeping the article in review.
router.patch("/articles/:articleId", requireRole("editor"), editorController.updateArticle);
// Publish the working version after the editor approves it.
router.post("/articles/:articleId/publish", requireRole("editor"), editorController.publishArticle);
// Return an article to the reporter with an editor note.
router.post("/articles/:articleId/request-changes", requireRole("editor"), editorController.requestArticleChanges);
// Remove an article from the editor's content system.
router.delete("/articles/:articleId", requireRole("editor"), editorController.deleteArticle);

module.exports = router;
