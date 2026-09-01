// Load helpers that read the cookie and find its saved session.
const { findSessionUser, readSessionToken } = require("../services/session.service");

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

// Load the connected user before protected routes check permissions.
async function loadSessionUser(req, res, next) {
  // Use try so database errors reach the central error handler.
  try {
    // Read the private session token from the request cookie.
    const token = readSessionToken(req);

    // Save the token so the logout controller can delete this session.
    req.sessionToken = token;

    // Find the connected user, or keep null when the visitor is a guest.
    req.user = token ? await findSessionUser(token) : null;

    // Continue to the next middleware after loading the user.
    next();
  } catch (error) {
    // Send errors caused by MongoDB to the central error middleware.
    next(error);
  }
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

// Export session loading together with the existing permission checks.
module.exports = { loadSessionUser, requireAuth, requireRole, isApiRequest };
