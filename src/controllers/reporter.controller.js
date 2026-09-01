const mongoose = require("mongoose"); // Load Mongoose so article IDs can be checked safely.
const Article = require("../models/article.model"); // Load the Article model so reporter articles can be stored and read.
const HttpError = require("../utils/http-error"); // Load the simple HTTP error class for expected request errors.

const FIELD_LIMITS = Object.freeze({ // Keep reporter limits equal to the Article schema limits.
  title: 180, // Limit the headline length used by the feed and article page.
  summary: 500, // Limit the short text shown in the feed.
  content: 20000, // Limit the full article body to a practical size.
  imageUrl: 1000, // Limit the stored image address.
  category: 80 // Limit the category value used by filters.
});

const statusLabels = Object.freeze({ // Keep the Hebrew label for each stored workflow status.
  draft: "בהכנה", // Show that the reporter can still edit the article.
  pending_review: "ממתינה לאישור עורך", // Show that the editor must review the article.
  published: "פורסמה", // Show that an approved version is public.
  changes_requested: "הוחזרה לתיקונים" // Show that the editor requested another revision.
});

function cleanText(value) { // Convert one form value into safe plain text.
  return String(value ?? "").trim(); // Remove extra spaces and prevent null values.
}

function canReporterEdit(status) { // Decide whether the reporter may change an article in this status.
  return ["draft", "published", "changes_requested"].includes(status); // Block editing only while an editor is reviewing the article.
}

function validateArticleFields(snapshot = {}, { requireAll = false } = {}) { // Validate reporter data before it reaches Mongoose.
  const source = snapshot && typeof snapshot === "object" ? snapshot : {}; // Replace null or primitive input with an empty form.
  const values = Object.fromEntries(Object.keys(FIELD_LIMITS).map((field) => [field, cleanText(source[field])])); // Normalize every editable field once.

  if (requireAll) { // Apply required-field checks only when the reporter submits for review.
    if (!values.title) return "יש להזין כותרת לפני השליחה."; // Require an article title.
    if (!values.summary) return "יש להזין תקציר לפני השליחה."; // Require a short summary.
    if (!values.category) return "יש לבחור קטגוריה לפני השליחה."; // Require a category for filtering.
    if (!values.imageUrl) return "יש להזין כתובת תמונה לפני השליחה."; // Require the main article image.
    if (!values.content) return "יש להזין תוכן לפני השליחה."; // Require the full article body.
  }

  for (const [field, limit] of Object.entries(FIELD_LIMITS)) { // Check every maximum before saving the draft.
    if (values[field].length > limit) return `${field} ארוך מדי. המגבלה היא ${limit} תווים.`; // Return a clear client-safe error.
  }

  return null; // Return no message when all required and length rules pass.
}

function validateSubmission(snapshot) { // Check all fields needed before editor review.
  return validateArticleFields(snapshot, { requireAll: true }); // Reuse the same rules used by autosave.
}

function buildWorkingVersion(article, input) { // Build the editable version from the reporter form.
  const form = input && typeof input === "object" ? input : {}; // Keep malformed request bodies from causing a server exception.
  const currentVersion = article.workingVersion || {}; // Keep dates and version data from the current draft.
  const publishedVersionNumber = Number(article.publishedVersion?.versionNumber || 0); // Read the last public version number.
  const currentVersionNumber = Number(currentVersion.versionNumber || 1); // Read the current working version number.
  const startsPublishedRevision = article.status === "published" && currentVersionNumber <= publishedVersionNumber; // Detect the first edit after publication.
  const versionNumber = startsPublishedRevision ? publishedVersionNumber + 1 : currentVersionNumber; // Give a published update its own version number.
  const createdAt = startsPublishedRevision ? new Date() : currentVersion.createdAt || new Date(); // Keep the draft creation time unless a new revision starts.

  return { // Return only fields that a reporter is allowed to change.
    versionNumber, // Store the working version number.
    title: cleanText(form.title), // Store the trimmed title.
    summary: cleanText(form.summary), // Store the trimmed summary.
    content: cleanText(form.content), // Store the trimmed article body.
    imageUrl: cleanText(form.imageUrl), // Store the trimmed image address.
    category: cleanText(form.category), // Store the trimmed category.
    createdAt, // Store when this draft version started.
    submittedAt: null // Mark the changed version as not submitted yet.
  };
}

function formatDate(value) { // Format a stored date for the Hebrew dashboard.
  if (!value) return "טרם נשמר"; // Show a clear fallback when no date exists.
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); // Return a short local date and time.
}

function toReporterArticle(article) { // Convert a database article into a simple view and API object.
  const publishedVersionNumber = Number(article.publishedVersion?.versionNumber || 0); // Read the public version number.
  const workingVersionNumber = Number(article.workingVersion?.versionNumber || 1); // Read the editable version number.
  const hasUnpublishedChanges = Boolean(article.publishedVersion) && workingVersionNumber > publishedVersionNumber; // Detect a private update to a published article.
  const label = article.status === "published" && hasUnpublishedChanges ? "פורסמה + טיוטת עדכון" : statusLabels[article.status]; // Explain the exact state to the reporter.

  return { // Return only the fields needed by the reporter screens.
    id: article._id.toString(), // Convert the MongoDB ID into text for links.
    status: article.status, // Keep the stored workflow status.
    statusLabel: label || article.status, // Add a readable Hebrew status.
    canEdit: canReporterEdit(article.status), // Tell the page whether editing is allowed.
    hasPublishedVersion: Boolean(article.publishedVersion), // Tell the page whether readers have a public version.
    hasUnpublishedChanges, // Tell the page whether a newer private draft exists.
    editorNote: article.editorNote || "", // Include the latest editor note when one exists.
    revisionNumber: article.revisionNumber, // Include the current revision number.
    updatedAt: article.updatedAt, // Keep the raw update date for API clients.
    updatedAtLabel: formatDate(article.updatedAt), // Add a readable update date for EJS.
    workingVersion: { // Keep the editable article fields together.
      versionNumber: workingVersionNumber, // Include the working version number.
      title: article.workingVersion?.title || "", // Include the draft title.
      summary: article.workingVersion?.summary || "", // Include the draft summary.
      content: article.workingVersion?.content || "", // Include the draft body.
      imageUrl: article.workingVersion?.imageUrl || "", // Include the draft image address.
      category: article.workingVersion?.category || "" // Include the draft category.
    }
  };
}

async function findReporterArticle(articleId, reporterId) { // Find one article only when it belongs to the logged-in reporter.
  if (!mongoose.isValidObjectId(articleId)) throw new HttpError(404, "הכתבה לא נמצאה."); // Reject malformed IDs without querying MongoDB.
  const article = await Article.findOne({ _id: articleId, author: reporterId }); // Apply ownership protection inside the database query.
  if (!article) throw new HttpError(404, "הכתבה לא נמצאה."); // Hide articles that do not exist or belong to another reporter.
  return article; // Return the owned article to the requested action.
}

async function showReporterDashboard(req, res, next) { // Render the reporter's personal article list.
  try { // Forward unexpected database errors to the shared error handler.
    const documents = await Article.find({ author: req.user._id }).sort({ updatedAt: -1 }).lean(); // Load only this reporter's articles, newest first.
    const articles = documents.map(toReporterArticle); // Convert database documents into simple display objects.
    res.render("pages/reporter", { pageTitle: "אזור כתב", activePage: "reporter", user: req.user, articles }); // Render the dashboard with the reporter and articles.
  } catch (error) { // Catch database and rendering errors.
    next(error); // Let the shared middleware return a safe error response.
  }
}

async function showReporterArticle(req, res, next) { // Render one reporter article for editing or viewing.
  try { // Forward unexpected database errors to the shared error handler.
    const document = await findReporterArticle(req.params.articleId, req.user._id); // Load the requested article with ownership protection.
    const article = toReporterArticle(document.toObject()); // Convert the Mongoose document into a simple page object.
    res.render("pages/reporter-edit", { pageTitle: article.workingVersion.title || "עריכת כתבה", activePage: "reporter", user: req.user, article }); // Render the editor page.
  } catch (error) { // Catch expected and unexpected errors.
    next(error); // Let the shared middleware choose the correct response.
  }
}

async function listReporterArticles(req, res, next) { // Return the reporter's article list as JSON.
  try { // Forward unexpected database errors to the shared error handler.
    const documents = await Article.find({ author: req.user._id }).sort({ updatedAt: -1 }).lean(); // Load only articles owned by this reporter.
    res.json({ articles: documents.map(toReporterArticle) }); // Send a small REST response to the browser.
  } catch (error) { // Catch database errors.
    next(error); // Let the shared middleware return a safe API error.
  }
}

async function getReporterArticle(req, res, next) { // Return one owned reporter article as JSON.
  try { // Forward unexpected database errors to the shared error handler.
    const document = await findReporterArticle(req.params.articleId, req.user._id); // Load the requested owned article.
    res.json({ article: toReporterArticle(document.toObject()) }); // Send the editable article fields to the browser.
  } catch (error) { // Catch expected and unexpected errors.
    next(error); // Let the shared middleware return the error.
  }
}

async function createReporterArticle(req, res, next) { // Create a new empty draft for the logged-in reporter.
  try { // Forward unexpected database errors to the shared error handler.
    const article = await Article.create({ // Insert the new article in MongoDB.
      author: req.user._id, // Make the logged-in reporter the owner.
      status: "draft", // Start every new article in the editable draft state.
      workingVersion: { versionNumber: 1, title: "", summary: "", content: "", imageUrl: "/images/demo-article.svg", category: "", createdAt: new Date() } // Create the first blank working version.
    });
    res.status(201).json({ articleId: article._id.toString(), editUrl: `/reporter/articles/${article._id}` }); // Return the new editor URL to the browser.
  } catch (error) { // Catch validation and database errors.
    next(error); // Let the shared middleware return a safe API error.
  }
}

async function saveReporterArticle(req, res, next) { // Save one reporter draft through AJAX or page-close autosave.
  try { // Forward unexpected database errors to the shared error handler.
    const article = await findReporterArticle(req.params.articleId, req.user._id); // Load the article with ownership protection.
    if (!canReporterEdit(article.status)) throw new HttpError(409, "לא ניתן לערוך כתבה בזמן שהיא ממתינה לאישור."); // Prevent edits during editor review.
    const nextWorkingVersion = buildWorkingVersion(article, req.body); // Build only the private version from the submitted fields.
    const validationMessage = validateArticleFields(nextWorkingVersion); // Check draft limits without requiring incomplete drafts to be complete.
    if (validationMessage) throw new HttpError(400, validationMessage); // Reject invalid draft data before writing to MongoDB.
    article.workingVersion = nextWorkingVersion; // Replace only the private working version with the validated fields.
    await article.save(); // Persist the autosaved version in MongoDB.
    res.json({ message: "הטיוטה נשמרה.", article: toReporterArticle(article.toObject()) }); // Confirm the save and return the current state.
  } catch (error) { // Catch expected and unexpected errors.
    next(error); // Let the shared middleware return the error.
  }
}

async function submitReporterArticle(req, res, next) { // Send a completed reporter article to the editor.
  try { // Forward unexpected database errors to the shared error handler.
    const article = await findReporterArticle(req.params.articleId, req.user._id); // Load the article with ownership protection.
    if (!canReporterEdit(article.status)) throw new HttpError(409, "הכתבה כבר ממתינה לאישור."); // Prevent a duplicate submission.
    const validationMessage = validateSubmission(article.workingVersion); // Check all required article fields.
    if (validationMessage) throw new HttpError(400, validationMessage); // Return the first clear validation problem.
    const publishedVersionNumber = Number(article.publishedVersion?.versionNumber || 0); // Read the last approved version number.
    const workingVersionNumber = Number(article.workingVersion.versionNumber || 1); // Read the version being submitted.
    if (article.publishedVersion && workingVersionNumber <= publishedVersionNumber) throw new HttpError(400, "יש לערוך את הכתבה לפני שליחת עדכון חדש."); // Prevent resubmitting an unchanged public version.
    article.workingVersion.submittedAt = new Date(); // Record when the reporter requested review.
    article.status = "pending_review"; // Move the article into the editor queue.
    article.editorNote = undefined; // Remove the old correction note after resubmission.
    await article.save(); // Persist the workflow change in MongoDB.
    res.json({ message: "הכתבה נשלחה לאישור עורך.", article: toReporterArticle(article.toObject()) }); // Confirm the successful submission.
  } catch (error) { // Catch expected and unexpected errors.
    next(error); // Let the shared middleware return the error.
  }
}

module.exports = { // Export page actions, REST actions, and small helpers used by tests.
  showReporterDashboard, // Export the dashboard page action.
  showReporterArticle, // Export the article editor page action.
  listReporterArticles, // Export the REST list action.
  getReporterArticle, // Export the REST read action.
  createReporterArticle, // Export the REST create action.
  saveReporterArticle, // Export the REST update and autosave action.
  submitReporterArticle, // Export the workflow submission action.
  buildWorkingVersion, // Export the version helper for focused tests.
  canReporterEdit, // Export the status helper for focused tests.
  validateSubmission // Export the validation helper for focused tests.
};
