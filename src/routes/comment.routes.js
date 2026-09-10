// Load Express, the comment controller, and the server-side role guard.
const express = require("express");
const commentController = require("../controllers/comment.controller");
const { requireRole } = require("../middleware/auth.middleware");

// Keep every comment moderation endpoint in one editor-protected router.
const router = express.Router();

// Return the moderation queue with search, visibility, and cursor pagination.
router.get("/", requireRole("editor"), commentController.listModerationQueue);
// Let the editor correct the text of one reader comment.
router.patch("/:commentId", requireRole("editor"), commentController.updateComment);
// Let the editor hide one reader comment with soft deletion.
router.delete("/:commentId", requireRole("editor"), commentController.deleteComment);
// Let the editor make one hidden comment visible again.
router.post("/:commentId/restore", requireRole("editor"), commentController.restoreComment);

module.exports = router;
