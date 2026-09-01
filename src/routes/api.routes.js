// Load Express and the database status reader.
const express = require("express");
const { getDatabaseStatus } = require("../config/database");

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

module.exports = router;
