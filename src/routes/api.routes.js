const express = require("express"); // Load Express so the JSON API router can be created.
const { getDatabaseStatus } = require("../config/database"); // Load the safe database status for health checks.
const reporterController = require("../controllers/reporter.controller"); // Load the reporter REST actions.
const { requireRole } = require("../middleware/auth.middleware"); // Load server-side role protection.

// Keep JSON endpoints in one router.
const router = express.Router();

// Provide a safe endpoint for local and deployment checks.
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "the-daily-web",
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString()
  });
});

router.get("/reporter/articles", requireRole("reporter"), reporterController.listReporterArticles); // List only the logged-in reporter's articles.
router.post("/reporter/articles", requireRole("reporter"), reporterController.createReporterArticle); // Create a new draft for the logged-in reporter.
router.get("/reporter/articles/:articleId", requireRole("reporter"), reporterController.getReporterArticle); // Read one owned reporter article.
router.put("/reporter/articles/:articleId", requireRole("reporter"), reporterController.saveReporterArticle); // Update the private working version through REST.
router.post("/reporter/articles/:articleId/autosave", requireRole("reporter"), reporterController.saveReporterArticle); // Save once more when the browser page closes.
router.post("/reporter/articles/:articleId/submit", requireRole("reporter"), reporterController.submitReporterArticle); // Move a completed draft to editor review.

module.exports = router;
