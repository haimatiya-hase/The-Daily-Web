function showHome(req, res) {
  res.render("pages/home", {
    pageTitle: "חדשות היום",
    activePage: "home"
  });
}

module.exports = { showHome };
