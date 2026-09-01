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

module.exports = { requireAuth, requireRole };
