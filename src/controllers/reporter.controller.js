// Render the reporter workspace for an authenticated reporter.
function showReporterDashboard(req, res) {
  res.render("pages/reporter", {
    pageTitle: "אזור כתב",
    activePage: "reporter",
    user: req.user
  });
}

module.exports = { showReporterDashboard };
