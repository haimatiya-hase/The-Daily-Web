// Load the analytics service that assembles the chart data.
const { getArticleAnalytics } = require("../services/analytics.service");

// Return the Impact Analytics series, publication markers, and impact numbers of one article.
const getAnalytics = async (req, res, next) => {
  try {
    res.json(await getArticleAnalytics(req.params.articleId, { range: String(req.query.range || "") }));
  } catch (error) {
    next(error);
  }
};

module.exports = { getAnalytics };
