// Render the public news feed shell.
function showHome(req, res) {
  // Render the home template with the active navigation item.
  res.render("pages/home", {
    // Use a readable Hebrew title for the browser tab.
    pageTitle: "חדשות היום",
    // Highlight Home in the shared navigation.
    activePage: "home"
  });
}

// Export the controller for the public web router.
module.exports = { showHome };
