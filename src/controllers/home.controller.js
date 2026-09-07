const mongoose = require("mongoose"); // Load Mongoose so cursor article IDs can be validated safely.
const Article = require("../models/article.model"); // Load articles for the public home feed.
const ViewEvent = require("../models/view-event.model"); // Load view events for viewed and unviewed filters.
const { hashClientKey } = require("../utils/client-key"); // Load the helper that protects anonymous browser keys.
const HttpError = require("../utils/http-error"); // Load the shared class for safe HTTP errors.

const FEED_PAGE_SIZE = 20; // Keep every feed page at the required twenty articles.
const FEED_CATEGORIES = ["חדשות", "כלכלה", "תרבות", "ספורט", "טכנולוגיה"]; // Keep accepted feed categories in one simple list.

function createCursor(article, sortBy) { // Turn the last article into a URL-safe cursor for the next page.
  const publishedAt = new Date(article.publishedVersion?.publishedAt); // Read the approved publication date used by both sort modes.
  if (!mongoose.isValidObjectId(article._id) || Number.isNaN(publishedAt.getTime())) return null; // Stop when the article cannot produce a safe cursor.

  const values = { sort: sortBy, id: String(article._id), publishedAt: publishedAt.toISOString() }; // Store the values needed to continue after this article.
  if (sortBy === "popularity") values.viewCount = Number(article.viewCount) || 0; // Add views only when popularity is the main sort value.
  return Buffer.from(JSON.stringify(values)).toString("base64url"); // Encode the cursor so it can travel in a query parameter.
}

function readCursor(value, sortBy) { // Read and validate a cursor received from the browser.
  try { // Catch malformed text without crashing the request.
    if (!value || value.length > 500) return null; // Reject missing or unusually long cursor values.
    const values = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); // Decode the stored cursor values.
    const publishedAt = new Date(values.publishedAt); // Convert the stored publication time back into a Date.
    if (values.sort !== sortBy) return null; // Prevent a cursor from one sort mode being used with another.
    if (!mongoose.isValidObjectId(values.id) || Number.isNaN(publishedAt.getTime())) return null; // Reject invalid article IDs or dates.
    if (sortBy === "popularity" && (!Number.isFinite(values.viewCount) || values.viewCount < 0)) return null; // Reject invalid popularity values.

    return { // Return the clean values used by the MongoDB range query.
      id: new mongoose.Types.ObjectId(values.id), // Convert the article ID into a real MongoDB ObjectId.
      publishedAt, // Keep the validated publication date.
      viewCount: Number(values.viewCount) || 0 // Keep a safe numeric view count.
    };
  } catch (error) { // Handle invalid Base64 or JSON cursor text.
    return null; // Tell the controller that cursor validation failed.
  }
}

function addCursorFilter(filter, cursor, sortBy) { // Add the next-page range to an existing MongoDB filter.
  if (!cursor) return; // Leave the first-page filter unchanged when there is no cursor.

  if (sortBy === "popularity") { // Use three values to continue a popularity-sorted page safely.
    filter.$or = [ // Match only records that appear after the previous card.
      { viewCount: { $lt: cursor.viewCount } }, // First continue with articles that have fewer views.
      { viewCount: cursor.viewCount, "publishedVersion.publishedAt": { $lt: cursor.publishedAt } }, // Then use date when view counts are equal.
      { viewCount: cursor.viewCount, "publishedVersion.publishedAt": cursor.publishedAt, _id: { $lt: cursor.id } } // Finally use ID when both other values are equal.
    ];
    return; // Stop before adding the date-only cursor rules.
  }

  filter.$or = [ // Continue a newest-first page after the previous approved article.
    { "publishedVersion.publishedAt": { $lt: cursor.publishedAt } }, // Match older publication dates first.
    { "publishedVersion.publishedAt": cursor.publishedAt, _id: { $lt: cursor.id } } // Use ID when publication dates are equal.
  ];
}

function showHome(req, res) { // Render the public news feed page shell.
  res.render("pages/home", { // Send the home template and its shared page values.
    pageTitle: "חדשות היום", // Set a readable Hebrew browser title.
    activePage: "home" // Highlight Home in the shared navigation.
  });
}

async function getPublicFeed(req, res, next) { // Return one page of approved article cards as JSON.
  try { // Forward expected and unexpected errors to shared middleware.
    const search = String(req.query?.search || "").trim().slice(0, 100); // Normalize and limit the public search text.
    const requestedCategory = String(req.query?.category || "").trim(); // Read the requested category as safe text.
    const category = FEED_CATEGORIES.includes(requestedCategory) ? requestedCategory : ""; // Accept only a category shown by the home form.
    const requestedViewStatus = String(req.query?.viewStatus || "").trim(); // Read the viewed filter as safe text.
    const viewStatus = ["viewed", "unviewed"].includes(requestedViewStatus) ? requestedViewStatus : ""; // Accept only the two supported view filters.
    const sortBy = req.query?.sort === "popularity" ? "popularity" : "publishedAt"; // Use date sorting unless popularity was requested.
    const cursorValue = String(req.query?.cursor || "").trim(); // Read the optional continuation cursor.
    const cursor = readCursor(cursorValue, sortBy); // Validate the cursor for the selected sort mode.
    if (cursorValue && !cursor) throw new HttpError(400, "Invalid feed cursor."); // Reject a malformed cursor before querying MongoDB.
    const clientKey = String(req.get?.("X-Client-Key") || "").trim().slice(0, 100); // Read a short anonymous browser key for view filtering.
    const filter = { // Start with the public-content boundary required by the assignment.
      "publishedVersion.publishedAt": { $ne: null } // Include every approved snapshot even while a newer update is under review.
    };

    if (search) filter.$text = { $search: search }; // Search only approved title and summary fields through the text index.
    if (category) filter["publishedVersion.category"] = category; // Limit results to the chosen approved category.

    if (viewStatus) { // Add the optional viewed or unviewed rule for this browser.
      const viewedArticleIds = clientKey // Read only articles connected to this anonymous browser.
        ? await ViewEvent.distinct("article", { clientKeyHash: hashClientKey(clientKey) }) // Query using the protected browser-key hash.
        : []; // Treat a missing browser key as no recorded views.
      filter._id = viewStatus === "viewed" // Choose whether matched IDs should be included or excluded.
        ? { $in: viewedArticleIds } // Return only articles already viewed by this browser.
        : { $nin: viewedArticleIds }; // Return only articles not yet viewed by this browser.
    }
    addCursorFilter(filter, cursor, sortBy); // Continue after the last card without using skip.

    const sortOrder = sortBy === "popularity" // Build the stable MongoDB order for the selected mode.
      ? { viewCount: -1, "publishedVersion.publishedAt": -1, _id: -1 } // Sort popular articles by views, date, and ID.
      : { "publishedVersion.publishedAt": -1, _id: -1 }; // Sort recent articles by date and ID.

    const articles = await Article.find(filter) // Start one filtered public article query.
      .select("author viewCount publishedVersion.title publishedVersion.summary publishedVersion.imageUrl publishedVersion.category publishedVersion.publishedAt") // Read only fields required by public cards.
      .populate("author", "displayName") // Replace the author ID with only the public display name.
      .sort(sortOrder) // Apply the selected stable order.
      .limit(FEED_PAGE_SIZE + 1) // Read one extra item to detect another page.
      .lean(); // Return plain objects because the feed does not edit documents.

    const hasExtraArticle = articles.length > FEED_PAGE_SIZE; // Detect whether the next page exists.
    const pageArticles = articles.slice(0, FEED_PAGE_SIZE); // Keep exactly twenty cards for the browser.
    const nextCursor = hasExtraArticle // Create a continuation value only when another page exists.
      ? createCursor(pageArticles[pageArticles.length - 1], sortBy) // Build the cursor from the last visible card.
      : null; // Return no cursor on the final page.
    const hasMore = Boolean(nextCursor); // Continue only when a valid next cursor was created.

    const publicArticles = pageArticles.map((article) => ({ // Flatten approved snapshots into a small public response.
      id: article._id, // Return the ID used by the article-page link.
      title: article.publishedVersion.title, // Return only the approved title.
      summary: article.publishedVersion.summary, // Return only the approved summary.
      imageUrl: article.publishedVersion.imageUrl, // Return only the approved image address.
      category: article.publishedVersion.category, // Return only the approved category.
      publishedAt: article.publishedVersion.publishedAt, // Return the approved publication time.
      authorName: article.author?.displayName || "מערכת The Daily Web", // Use a safe fallback when the author is unavailable.
      viewCount: article.viewCount || 0 // Return a safe popularity value for the card.
    }));

    res.json({ // Send the cards and continuation state to the AJAX client.
      articles: publicArticles, // Return this page of approved cards.
      pagination: { pageSize: FEED_PAGE_SIZE, hasMore, nextCursor }, // Describe the fixed page size and next page.
      search, // Return the normalized search text.
      filters: { category, viewStatus }, // Return the normalized active filters.
      sort: sortBy // Return the active sort mode.
    });
  } catch (error) { // Catch database and validation failures.
    next(error); // Let shared API middleware create the safe error response.
  }
}

module.exports = { showHome, getPublicFeed }; // Export the page and API actions for Express routes.
