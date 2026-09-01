const express = require("express");
const { getDatabaseStatus } = require("../config/database");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "the-daily-web",
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
