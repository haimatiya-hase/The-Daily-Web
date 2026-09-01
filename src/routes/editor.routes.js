// Load Express, the editor controller, and the server-side role guard.
const express = require("express");
const editorController = require("../controllers/editor.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep every editor REST endpoint in one protected router.
const router = express.Router();

router.get("/articles", requireRole("editor"), editorController.listArticles);
router.get("/articles/:articleId", requireRole("editor"), editorController.getArticle);
router.patch("/articles/:articleId", requireRole("editor"), editorController.updateArticle);
router.post("/articles/:articleId/publish", requireRole("editor"), editorController.publishArticle);
router.post("/articles/:articleId/request-changes", requireRole("editor"), editorController.requestArticleChanges);
router.delete("/articles/:articleId", requireRole("editor"), editorController.deleteArticle);

module.exports = router;
