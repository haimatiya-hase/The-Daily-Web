const logger = require("../utils/logger");

function notFoundHandler(req, res) {
  res.status(404).render("pages/error", {
    pageTitle: "העמוד לא נמצא",
    statusCode: 404,
    message: "הכתובת שביקשתם אינה קיימת."
  });
}

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

  const statusCode = Number(error.statusCode) || 500;
  res.status(statusCode).render("pages/error", {
    pageTitle: "שגיאה",
    statusCode,
    message: statusCode === 500 ? "אירעה שגיאה בלתי צפויה. נסו שוב מאוחר יותר." : error.message
  });
}

module.exports = { notFoundHandler, errorHandler };
