// Load the view statistics service that implements the CRUD rules.
const viewService = require("../services/view.service");

// Render the editor statistics page shell; the data loads through AJAX.
const showViewsPage = (req, res) => {
  res.render("pages/views", {
    pageTitle: "סטטיסטיקות צפייה",
    activePage: "views",
    user: req.user,
    // Give the template the accepted sort values so the dropdown and the API stay in sync.
    sorts: viewService.STATS_SORTS
  });
};

// Return one page of published articles with their view totals.
const listViewStats = async (req, res, next) => {
  try {
    res.json(await viewService.listArticleViewStats({
      search: req.query.search,
      sort: req.query.sort,
      page: req.query.page
    }));
  } catch (error) {
    next(error);
  }
};

// Return the detailed statistics of one article.
const getArticleViewStats = async (req, res, next) => {
  try {
    res.json(await viewService.getArticleViewSummary(req.params.articleId));
  } catch (error) {
    next(error);
  }
};

// Recompute the buckets and counter of one article from its raw events.
const rebuildArticleViewStats = async (req, res, next) => {
  try {
    const result = await viewService.rebuildArticleViewStats(req.params.articleId);
    // Return the refreshed summary so the screen can redraw without a second request.
    res.json({ result, summary: await viewService.getArticleViewSummary(req.params.articleId) });
  } catch (error) {
    next(error);
  }
};

// Delete every view record of one article.
const deleteArticleViewData = async (req, res, next) => {
  try {
    const result = await viewService.deleteArticleViewData(req.params.articleId);
    res.json({ result, summary: await viewService.getArticleViewSummary(req.params.articleId) });
  } catch (error) {
    next(error);
  }
};

module.exports = { showViewsPage, listViewStats, getArticleViewStats, rebuildArticleViewStats, deleteArticleViewData };
