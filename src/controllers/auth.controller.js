// Load the User model so submitted usernames can be found in MongoDB.
const User = require("../models/user.model");
// Load the safe password comparison helper.
const { verifyPassword } = require("../utils/password");
// Load helpers that create and remove persistent login sessions.
const {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie
} = require("../services/session.service");

// Show the login form only when no valid user is already connected.
function showLogin(req, res) {
  // Skip the login form when the session middleware already loaded a user.
  if (req.user) {
    // Send each user to the dashboard that matches the saved role.
    res.redirect(req.user.role === "editor" ? "/editor" : "/reporter");
    // Stop the controller after sending the redirect.
    return;
  }

  // Render an empty login form for unauthenticated visitors.
  res.render("pages/login", {
    // Set the browser title for the shared page template.
    pageTitle: "התחברות",
    // Highlight the login item in the site navigation.
    activePage: "login",
    // Hide authentication errors before the first form submission.
    errorMessage: null,
    // Start with an empty username input.
    username: ""
  });
}

// Check submitted credentials and create a session after a successful login.
async function login(req, res, next) {
  // Catch database or cryptography errors so the central handler can process them.
  try {
    // Normalize the username exactly like the lowercase User schema field.
    const username = String(req.body.username || "").trim().toLowerCase();
    // Convert the submitted password to a string without logging it.
    const password = String(req.body.password || "");
    // Select passwordHash explicitly because the schema hides it by default.
    const user = await User.findOne({ username }).select("+passwordHash");
    // Verify the password only when a matching user exists.
    const isValid = user && await verifyPassword(password, user.passwordHash);

    // Reject unknown users and incorrect passwords with the same safe message.
    if (!isValid) {
      // Render the form again with the correct unauthorized status code.
      res.status(401).render("pages/login", {
        // Preserve the normal page title after a failed login.
        pageTitle: "התחברות",
        // Keep the login navigation item highlighted.
        activePage: "login",
        // Avoid revealing which credential was incorrect.
        errorMessage: "שם המשתמש או הסיסמה אינם נכונים.",
        // Preserve the safe username so only the password must be retyped.
        username
      });
      // Stop before creating a session for invalid credentials.
      return;
    }

    // Create a random session token and store only its hash in MongoDB.
    const token = await createSession(user._id);
    // Place the random token in a protected HTTP-only browser cookie.
    setSessionCookie(res, token);
    // Redirect the authenticated user according to the database role.
    res.redirect(user.role === "editor" ? "/editor" : "/reporter");
  // Catch unexpected failures during the authentication process.
  } catch (error) {
    // Forward the error without exposing internal details to the visitor.
    next(error);
  }
}

// Delete the current session and remove its browser cookie.
async function logout(req, res, next) {
  // Catch database errors so logout failures use the central error handler.
  try {
    // Delete only the session represented by the current request token.
    await destroySession(req.sessionToken);
    // Clear the browser cookie even when the session was already missing.
    clearSessionCookie(res);
    // Return the visitor to the login page after logout.
    res.redirect("/login");
  // Catch unexpected failures while deleting the session.
  } catch (error) {
    // Forward the error to the shared error middleware.
    next(error);
  }
}

// Export the page, login, and logout handlers for the web router.
module.exports = { showLogin, login, logout };
