// Load the article model used by the public feed.
const Article = require("../models/article.model");

// Keep every feed request at the assignment limit of twenty articles.
const FEED_PAGE_SIZE = 20;

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

// Return the newest approved article versions for the public feed.
async function getPublicFeed(req, res, next) {
  try {
    // Accept only a positive whole page number and fall back to the first page.
    const pageValue = String(req.query?.page || "1");
    const requestedPage = Number(pageValue);
    const page = /^\d+$/.test(pageValue) && Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    // Read only published articles and only the public fields needed by cards.
    const articles = await Article.find({
      status: "published",
      publishedVersion: { $ne: null }
    })
      .select("author viewCount publishedVersion.title publishedVersion.summary publishedVersion.imageUrl publishedVersion.category publishedVersion.publishedAt")
      .populate("author", "displayName")
      .sort({ "publishedVersion.publishedAt": -1, _id: -1 })
      .skip((page - 1) * FEED_PAGE_SIZE)
      .limit(FEED_PAGE_SIZE + 1)
      .lean();

    // Use one extra result to know whether another page is available.
    const hasMore = articles.length > FEED_PAGE_SIZE;
    const pageArticles = articles.slice(0, FEED_PAGE_SIZE);

    // Flatten the approved version into a small and predictable public response.
    const publicArticles = pageArticles.map((article) => ({
      id: article._id,
      title: article.publishedVersion.title,
      summary: article.publishedVersion.summary,
      imageUrl: article.publishedVersion.imageUrl,
      category: article.publishedVersion.category,
      publishedAt: article.publishedVersion.publishedAt,
      authorName: article.author?.displayName || "מערכת The Daily Web",
      viewCount: article.viewCount || 0
    }));

    res.json({
      articles: publicArticles,
      pagination: { page, pageSize: FEED_PAGE_SIZE, hasMore }
    });
  } catch (error) {
    // Let the shared API error handler return a safe JSON response.
    next(error);
  }
}

// Export the page and feed actions for the web and API routers.
module.exports = { showHome, getPublicFeed };
