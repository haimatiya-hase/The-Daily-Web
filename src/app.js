const express = require("express");
const path = require("node:path");
const webRoutes = require("./routes/web.routes");
const apiRoutes = require("./routes/api.routes");
const logger = require("./utils/logger");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");

function createApp() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, "../public")));

  app.use((req, res, next) => {
    res.locals.appName = "The Daily Web";
    res.locals.currentUser = req.user || null;
    next();
  });

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

  app.use("/api", apiRoutes);
  app.use("/", webRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
