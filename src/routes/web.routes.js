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
// Receive credentials submitted by the login form.
router.post("/login", authController.login);
// End only the session represented by the current browser cookie.
router.post("/logout", authController.logout);
router.get("/reporter", requireRole("reporter"), reporterController.showReporterDashboard);
router.get("/reporter/articles/:articleId", requireRole("reporter"), reporterController.showReporterArticle); // Show one owned article in the reporter editor.
router.get("/editor", requireRole("editor"), editorController.showEditorDashboard);

module.exports = router;
