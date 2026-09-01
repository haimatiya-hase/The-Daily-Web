// Load the logger and request-type helper used by both error handlers.
const logger = require("../utils/logger");
const { isApiRequest } = require("./auth.middleware");

// Render a friendly page for unknown URLs.
function notFoundHandler(req, res) {
  // Use JSON for missing API routes because browser scripts cannot render HTML.
  if (isApiRequest(req)) {
    res.status(404).json({ error: { statusCode: 404, message: "The requested route was not found." } });
    return;
  }

  // Render the normal error page for a missing browser page.
  res.status(404).render("pages/error", {
    pageTitle: "העמוד לא נמצא",
    statusCode: 404,
    message: "הכתובת שביקשתם אינה קיימת."
  });
}

// Convert unexpected errors into a safe response and a useful log.
function errorHandler(error, req, res, next) {
  // Keep technical details in server logs for debugging, not in the response.
  logger.error("Unhandled request error", {
    method: req.method,
    path: req.path,
    message: error.message,
    stack: error.stack
  });

  if (res.headersSent) {
    // Let Express finish an already-started response safely.
    next(error);
    return;
  }

  // Do not expose internal details for unexpected server errors.
  const statusCode = Number(error.statusCode) || (error.name === "ValidationError" ? 400 : 500); // Treat invalid Mongoose input as a normal client error.
  const safeMessage = error.name === "ValidationError" ? "הנתונים שנשלחו אינם תקינים." : statusCode === 500 ? "An unexpected server error occurred." : error.message; // Hide internal details while keeping expected messages useful.

  if (isApiRequest(req)) {
    // Return the same structured shape used by all REST error responses.
    res.status(statusCode).json({
      error: {
        statusCode,
        message: safeMessage
      }
    });
    return;
  }

  // Render a safe HTML error page for normal browser requests.
  res.status(statusCode).render("pages/error", {
    pageTitle: "שגיאה",
    statusCode,
    message: safeMessage
  });
}

module.exports = { notFoundHandler, errorHandler };
