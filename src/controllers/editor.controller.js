function showEditorDashboard(req, res) {
  res.render("pages/editor", {
    pageTitle: "אזור עורך",
    activePage: "editor",
    user: req.user
  });
}

module.exports = { showEditorDashboard };
