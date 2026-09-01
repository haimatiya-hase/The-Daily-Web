const logger = require("../utils/logger");
const { isApiRequest } = require("./auth.middleware");

// Render a friendly page for unknown URLs.
function notFoundHandler(req, res) {
  if (isApiRequest(req)) {
    res.status(404).json({ error: { statusCode: 404, message: "The requested route was not found." } });
    return;
  }

  res.status(404).render("pages/error", {
    pageTitle: "העמוד לא נמצא",
    statusCode: 404,
    message: "הכתובת שביקשתם אינה קיימת."
  });
}

// Convert unexpected errors into a safe response and a useful log.
function errorHandler(error, req, res, next) {
  logger.error("Unhandled request error", {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  // Do not expose internal details for unexpected server errors.
  const statusCode = Number(error.statusCode) || (error.name === "ValidationError" ? 400 : 500); // Treat invalid Mongoose input as a normal client error.
  const safeMessage = error.name === "ValidationError" ? "הנתונים שנשלחו אינם תקינים." : statusCode === 500 ? "An unexpected server error occurred." : error.message; // Hide internal details while keeping expected messages useful.

  if (isApiRequest(req)) {
    res.status(statusCode).json({
      error: {
        statusCode,
        message: safeMessage
      }
    });
    return;
  }

  res.status(statusCode).render("pages/error", {
    pageTitle: "שגיאה",
    statusCode,
    message: safeMessage
  });
}

module.exports = { notFoundHandler, errorHandler };
