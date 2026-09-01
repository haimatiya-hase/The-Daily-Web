// Render the SEO-friendly article page shell.
function showArticle(req, res) {
  // Render the article template with the id taken from the URL.
  res.render("pages/article", {
    // Use a readable title until the real article data is loaded.
    pageTitle: "כתבה",
    // Keep the article navigation state active.
    activePage: "article",
    // Pass the requested id to the placeholder or future data query.
    articleId: req.params.articleId,
    // Use null to show the honest scaffold state until article APIs are merged.
    article: null
  });
}

// Export the controller for the public web router.
module.exports = { showArticle };
