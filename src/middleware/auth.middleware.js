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
