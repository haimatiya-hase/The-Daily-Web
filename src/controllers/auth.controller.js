function showLogin(req, res) {
  res.render("pages/login", {
    pageTitle: "התחברות",
    activePage: "login"
  });
}

module.exports = { showLogin };
