// Load the shared error class used by the HTTP controllers.
const HttpError = require("../utils/http-error");

// Keep status values in one place so the workflow is easy to read.
const ARTICLE_STATUSES = Object.freeze({
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  PUBLISHED: "published",
  CHANGES_REQUESTED: "changes_requested"
});

// Keep validation limits equal to the article schema limits.
const FIELD_LIMITS = Object.freeze({
  title: 180,
  summary: 500,
  content: 20000,
  imageUrl: 1000,
  category: 80,
  editorNote: 2000
});

// Convert a form value into clean text without changing undefined values elsewhere.
function cleanText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

// Read a Mongoose subdocument or a plain object in the same way.
function toPlainObject(value) {
  if (!value) {
    return {};
  }

  return typeof value.toObject === "function" ? value.toObject() : { ...value };
}

// Copy only the fields that belong to an article version.
function cloneVersion(version) {
  const source = toPlainObject(version);

  return {
    versionNumber: Number(source.versionNumber) || 1,
    title: cleanText(source.title),
    summary: cleanText(source.summary),
    content: cleanText(source.content),
    imageUrl: cleanText(source.imageUrl),
    category: cleanText(source.category),
    createdAt: source.createdAt,
    submittedAt: source.submittedAt,
    publishedAt: source.publishedAt,
    approvedAt: source.approvedAt,
    approvedBy: source.approvedBy
  };
}

// Validate and normalize the fields that an editor can change.
function validateEditorUpdate(payload = {}) {
  const values = {
    title: cleanText(payload.title),
    summary: cleanText(payload.summary),
    content: cleanText(payload.content),
    imageUrl: cleanText(payload.imageUrl),
    category: cleanText(payload.category)
  };

  const errors = [];

  // Required fields must contain real text after trimming spaces.
  for (const field of ["title", "content", "category"]) {
    if (!values[field]) {
      errors.push(`${field} is required.`);
    }
  }

  // Reject values that are longer than the database schema allows.
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (field !== "editorNote" && values[field].length > limit) {
      errors.push(`${field} must be ${limit} characters or less.`);
    }
  }

  if (errors.length > 0) {
    throw new HttpError(400, errors.join(" "));
  }

  return values;
}

// Make sure an editor action starts from the only allowed editor state.
function requirePendingReview(article) {
  if (!article) {
    throw new HttpError(404, "Article was not found.");
  }

  if (article.status !== ARTICLE_STATUSES.PENDING_REVIEW) {
    throw new HttpError(409, "Only an article waiting for review can use this action.");
  }
}

// Apply an editor correction while keeping the article in the review queue.
function applyEditorEdit(article, payload, editorId, now = new Date()) {
  requirePendingReview(article);

  const values = validateEditorUpdate(payload);
  const currentVersion = cloneVersion(article.workingVersion);

  // Change only the working copy, never the already published copy.
  article.workingVersion = { ...currentVersion, ...values };
  article.revisionNumber = Number(article.revisionNumber) || 1;
  article.revisionNumber += 1;
  article.lastEditedBy = editorId;
  article.lastEditedAt = now;
  article.editorNote = "";

  return article;
}

// Publish the submitted working copy as a new public version.
function approveArticle(article, editorId, now = new Date()) {
  requirePendingReview(article);

  const publishedVersion = cloneVersion(article.workingVersion);
  const previousVersion = toPlainObject(article.publishedVersion);

  // Publication numbers increase only when readers receive a new version.
  publishedVersion.versionNumber = (Number(previousVersion.versionNumber) || 0) + 1;
  publishedVersion.publishedAt = now;
  publishedVersion.approvedAt = now;
  publishedVersion.approvedBy = editorId;

  // Replace the public copy only after the editor approves it.
  article.publishedVersion = publishedVersion;
  article.status = ARTICLE_STATUSES.PUBLISHED;
  article.editorNote = "";
  article.reviewedBy = editorId;
  article.reviewedAt = now;

  return article;
}

// Return a pending article to the reporter with a clear explanation.
function requestChanges(article, editorId, note, now = new Date()) {
  requirePendingReview(article);

  const cleanNote = cleanText(note);

  if (!cleanNote) {
    throw new HttpError(400, "An editor note is required when requesting changes.");
  }

  if (cleanNote.length > FIELD_LIMITS.editorNote) {
    throw new HttpError(400, `editorNote must be ${FIELD_LIMITS.editorNote} characters or less.`);
  }

  // Keep the submitted content available while changing only the workflow state.
  article.status = ARTICLE_STATUSES.CHANGES_REQUESTED;
  article.editorNote = cleanNote;
  article.reviewedBy = editorId;
  article.reviewedAt = now;

  return article;
}

module.exports = {
  ARTICLE_STATUSES,
  FIELD_LIMITS,
  validateEditorUpdate,
  cloneVersion,
  applyEditorEdit,
  approveArticle,
  requestChanges
};
