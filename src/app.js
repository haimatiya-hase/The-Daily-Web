// Load Express, path helpers, routes, logging, and error middleware.
const express = require("express");
const path = require("node:path");
const webRoutes = require("./routes/web.routes");
const apiRoutes = require("./routes/api.routes");
const editorRoutes = require("./routes/editor.routes");
const logger = require("./utils/logger");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
// Load the middleware that restores users from persistent session cookies.
const { loadSessionUser } = require("./middleware/auth.middleware");

// Build the application without starting a network port.
function createApp() {
  // Create a fresh Express instance so tests can import the app safely.
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
    // Make the application name available to every EJS template.
    res.locals.appName = "The Daily Web";
    // Make the current session user available to the shared header.
    res.locals.currentUser = req.user || null;
    // Continue after the common template values are ready.
    next();
  });

  // Log every completed request with its duration.
  app.use((req, res, next) => {
    // Save the start time so the final log contains request duration.
    const startedAt = Date.now();
    res.on("finish", () => {
      // Log only after Express has selected the final response status.
      logger.info("HTTP request", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    // Let the request continue to the selected route.
    next();
  });

  // Mount API routes before browser routes.
  app.use("/api/editor", editorRoutes);
  // Mount general JSON routes such as health, weather, and reporter actions.
  app.use("/api", apiRoutes);
  // Mount browser pages such as home, login, reporter, and editor.
  app.use("/", webRoutes);
  // Return a 404 response when no route matched the request.
  app.use(notFoundHandler);
  // Convert all forwarded errors into one safe response format.
  app.use(errorHandler);

  // Return the configured app so the server or tests can use it.
  return app;
}

module.exports = createApp;
