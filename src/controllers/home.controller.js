// Load the article model used by the public feed.
const Article = require("../models/article.model");
const ViewEvent = require("../models/view-event.model");
const { hashClientKey } = require("../utils/client-key");

// Keep every feed request at the assignment limit of twenty articles.
const FEED_PAGE_SIZE = 20;
const FEED_CATEGORIES = ["חדשות", "כלכלה", "תרבות", "ספורט", "טכנולוגיה"];

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
    // Keep the public search short and ignore surrounding spaces.
    const search = String(req.query?.search || "").trim().slice(0, 100);
    const requestedCategory = String(req.query?.category || "").trim();
    const category = FEED_CATEGORIES.includes(requestedCategory) ? requestedCategory : "";
    const requestedViewStatus = String(req.query?.viewStatus || "").trim();
    const viewStatus = ["viewed", "unviewed"].includes(requestedViewStatus) ? requestedViewStatus : "";
    const sortBy = req.query?.sort === "popularity" ? "popularity" : "publishedAt";
    const clientKey = String(req.get?.("X-Client-Key") || "").trim().slice(0, 100);
    const filter = {
      status: "published",
      publishedVersion: { $ne: null }
    };

    // Use the existing MongoDB text index only when the visitor entered a term.
    if (search) filter.$text = { $search: search };
    if (category) filter["publishedVersion.category"] = category;

    // Match articles against this anonymous visitor's stored view events.
    if (viewStatus) {
      const viewedArticleIds = clientKey
        ? await ViewEvent.distinct("article", { clientKeyHash: hashClientKey(clientKey) })
        : [];
      filter._id = viewStatus === "viewed"
        ? { $in: viewedArticleIds }
        : { $nin: viewedArticleIds };
    }

    // Keep pagination stable when several articles share the same main sort value.
    const sortOrder = sortBy === "popularity"
      ? { viewCount: -1, "publishedVersion.publishedAt": -1, _id: -1 }
      : { "publishedVersion.publishedAt": -1, _id: -1 };

    // Read only published articles and only the public fields needed by cards.
    const articles = await Article.find(filter)
      .select("author viewCount publishedVersion.title publishedVersion.summary publishedVersion.imageUrl publishedVersion.category publishedVersion.publishedAt")
      .populate("author", "displayName")
      .sort(sortOrder)
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
      pagination: { page, pageSize: FEED_PAGE_SIZE, hasMore },
      search,
      filters: { category, viewStatus },
      sort: sortBy
    });
  } catch (error) {
    // Let the shared API error handler return a safe JSON response.
    next(error);
  }
}

// Export the page and feed actions for the web and API routers.
module.exports = { showHome, getPublicFeed };
