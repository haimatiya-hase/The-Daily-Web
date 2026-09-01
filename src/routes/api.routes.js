// Load Express and the database status reader.
const express = require("express");
const { getDatabaseStatus } = require("../config/database");
const reporterController = require("../controllers/reporter.controller"); // Load the reporter REST actions.
const { requireRole } = require("../middleware/auth.middleware"); // Load server-side role protection.
// Load the cached weather service used by the home page widget.
const { getWeather } = require("../services/weather.service");

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

// Return only the current weather values required by the browser widget.
router.get("/weather", async (req, res) => {
  // Protect the API route from temporary external weather service failures.
  try {
    // Read fresh or cached weather data from the server-side service.
    const weather = await getWeather();
    // Read the current weather object when the service returned usable data.
    const current = weather?.current;

    // Tell the browser that weather is unavailable when configuration is missing.
    if (!current) {
      // Use a successful response because the website itself is still working.
      return res.json({ available: false });
    }

    // Send a small safe response instead of exposing the full external payload.
    return res.json({
      // Confirm that the widget can display the returned values.
      available: true,
      // Return the current temperature as a number.
      temperature: current.temperature_2m,
      // Return the standard weather code used to select a description.
      weatherCode: current.weather_code,
      // Return the observation time supplied by the weather service.
      observedAt: current.time || null
    });
  // Handle a failed external request without passing private error details to visitors.
  } catch (error) {
    // Return a temporary-unavailable status with a predictable response shape.
    return res.status(503).json({ available: false });
  }
});

module.exports = router;
