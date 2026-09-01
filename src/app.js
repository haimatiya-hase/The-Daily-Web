// Load Express, path helpers, routes, logging, and error middleware.
const express = require("express");
const path = require("node:path");
const webRoutes = require("./routes/web.routes");
const apiRoutes = require("./routes/api.routes");
const logger = require("./utils/logger");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
// Load the middleware that restores users from persistent session cookies.
const { loadSessionUser } = require("./middleware/auth.middleware");

// Build the application without starting a network port.
function createApp() {
  const app = express();

  // Configure EJS as the server-side view engine.
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Parse small JSON and HTML form requests.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  // Serve CSS, JavaScript, and local images.
  app.use(express.static(path.join(__dirname, "../public")));
  // Restore the connected user before views and protected routes use req.user.
  app.use(loadSessionUser);

  // Set values that every EJS page can use.
  app.use((req, res, next) => {
    res.locals.appName = "The Daily Web";
    res.locals.currentUser = req.user || null;
    next();
  });

  // Log every completed request with its duration.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info("HTTP request", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  // Mount API routes before browser routes.
  app.use("/api", apiRoutes);
  app.use("/", webRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
