// Load Express and the web controllers.
const express = require("express");
const homeController = require("../controllers/home.controller");
const articleController = require("../controllers/article.controller");
const authController = require("../controllers/auth.controller");
const reporterController = require("../controllers/reporter.controller");
const editorController = require("../controllers/editor.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep browser page routes in one router.
const router = express.Router();

router.get("/", homeController.showHome);
router.get("/articles/:articleId", articleController.showArticle);
router.get("/login", authController.showLogin);
router.get("/reporter", requireRole("reporter"), reporterController.showReporterDashboard);
router.get("/editor", requireRole("editor"), editorController.showEditorDashboard);

module.exports = router;
