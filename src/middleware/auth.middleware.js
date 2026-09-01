// Load helpers that read the cookie and find its saved session.
const { findSessionUser, readSessionToken } = require("../services/session.service");

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
  // Catch errors caused while reading the session from MongoDB.
  } catch (error) {
    // Send the error to the application's central error middleware.
    next(error);
  }
}
// Block users who do not have a loaded session user.
function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).render("pages/error", {
      pageTitle: "נדרשת התחברות",
      statusCode: 401,
      message: "יש להתחבר כדי לגשת לאזור זה."
    });
    return;
  }

  next();
}

// Allow only selected roles to continue to a protected route.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).render("pages/error", {
        pageTitle: "נדרשת התחברות",
        statusCode: 401,
        message: "יש להתחבר כדי לגשת לאזור זה."
      });
      return;
    }

    // Check the role on the server, not only in the browser.
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).render("pages/error", {
        pageTitle: "אין הרשאה",
        statusCode: 403,
        message: "אין למשתמש המחובר הרשאה לבצע פעולה זו."
      });
      return;
    }

    next();
  };
}

// Export session loading together with the existing permission checks.
module.exports = { loadSessionUser, requireAuth, requireRole };
