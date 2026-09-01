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
  const statusCode = Number(error.statusCode) || 500;

  if (isApiRequest(req)) {
    res.status(statusCode).json({
      error: {
        statusCode,
        message: statusCode === 500 ? "An unexpected server error occurred." : error.message
      }
    });
    return;
  }

  res.status(statusCode).render("pages/error", {
    pageTitle: "שגיאה",
    statusCode,
    message: statusCode === 500 ? "אירעה שגיאה בלתי צפויה. נסו שוב מאוחר יותר." : error.message
  });
}

module.exports = { notFoundHandler, errorHandler };
