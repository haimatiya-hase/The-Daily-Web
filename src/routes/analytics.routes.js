// Load Express, the analytics controller, and the server-side role guard.
const express = require("express");
const analyticsController = require("../controllers/analytics.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep the Impact Analytics endpoint in one editor-protected router.
const router = express.Router();

// Return the views series, the publication markers, and the before/after impact of one article.
router.get("/:articleId", requireRole("editor"), analyticsController.getAnalytics);

module.exports = router;
