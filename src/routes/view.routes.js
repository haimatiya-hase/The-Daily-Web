// Load Express, the view statistics controller, and the server-side role guard.
const express = require("express");
const viewController = require("../controllers/view.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep every statistics endpoint in one editor-protected router.
const router = express.Router();

// List published articles with totals, search, sort, and paging.
router.get("/", requireRole("editor"), viewController.listViewStats);
// Read the detailed statistics of one article.
router.get("/:articleId", requireRole("editor"), viewController.getArticleViewStats);
// Rebuild the buckets and counter of one article from its raw events.
router.post("/:articleId/rebuild", requireRole("editor"), viewController.rebuildArticleViewStats);
// Delete every view record of one article.
router.delete("/:articleId", requireRole("editor"), viewController.deleteArticleViewData);

module.exports = router;
