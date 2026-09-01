// Render the editor workspace for an authenticated editor.
function showEditorDashboard(req, res) {
  res.render("pages/editor", {
    pageTitle: "אזור עורך",
    activePage: "editor",
    user: req.user
  });
}

module.exports = { showEditorDashboard };
