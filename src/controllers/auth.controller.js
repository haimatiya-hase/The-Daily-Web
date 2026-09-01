// Show the login form before the authentication flow is connected.
function showLogin(req, res) {
  res.render("pages/login", {
    pageTitle: "התחברות",
    activePage: "login"
  });
}

module.exports = { showLogin };
