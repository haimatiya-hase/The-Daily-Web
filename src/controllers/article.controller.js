// Render the SEO-friendly article page shell.
function showArticle(req, res) {
  res.render("pages/article", {
    pageTitle: "כתבה",
    activePage: "article",
    articleId: req.params.articleId,
    article: null
  });
}

module.exports = { showArticle };
