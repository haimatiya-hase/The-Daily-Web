// Detect API requests so AJAX callers receive JSON instead of an HTML page.
function isApiRequest(req) {
  const acceptHeader = req.get("Accept") || "";
  return req.originalUrl.startsWith("/api/") || acceptHeader.includes("application/json");
}

// Send one consistent access error for browser pages and REST endpoints.
function sendAccessError(req, res, statusCode, pageTitle, message) {
  if (isApiRequest(req)) {
    res.status(statusCode).json({ error: { statusCode, message } });
    return;
  }

  res.status(statusCode).render("pages/error", {
    pageTitle,
    statusCode,
    message
  });
}

// Block users who do not have a loaded session user.
function requireAuth(req, res, next) {
  if (!req.user) {
    sendAccessError(req, res, 401, "נדרשת התחברות", "יש להתחבר כדי לגשת לאזור זה.");
    return;
  }

  next();
}

// Allow only selected roles to continue to a protected route.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      sendAccessError(req, res, 401, "נדרשת התחברות", "יש להתחבר כדי לגשת לאזור זה.");
      return;
    }

    // Check the role on the server, not only in the browser.
    if (!allowedRoles.includes(req.user.role)) {
      sendAccessError(req, res, 403, "אין הרשאה", "אין למשתמש המחובר הרשאה לבצע פעולה זו.");
      return;
    }

    next();
  };
}

module.exports = { requireAuth, requireRole, isApiRequest };
