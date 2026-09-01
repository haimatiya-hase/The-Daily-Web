// Load Node's built-in test tools so no extra test package is needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyEditorEdit,
  approveArticle,
  requestChanges,
  validateEditorUpdate
} = require("../src/services/article-workflow.service");

// Build a small plain article object for isolated workflow tests.
function makeArticle(status = "pending_review") {
  return {
    status,
    revisionNumber: 1,
    editorNote: "",
    workingVersion: {
      versionNumber: 1,
      title: "Original title",
      summary: "Original summary",
      content: "Original content",
      category: "News",
      imageUrl: ""
    },
    publishedVersion: null
  };
}

// Keep test timestamps stable so the assertions are easy to understand.
const testDate = new Date("2026-01-01T10:00:00.000Z");

test("editor can save a valid correction without publishing", () => {
  // Start with an article that is waiting for editor review.
  const article = makeArticle();

  // Apply a valid correction through the shared workflow service.
  applyEditorEdit(article, {
    title: "Edited title",
    summary: "Edited summary",
    content: "Edited content",
    category: "Technology",
    imageUrl: "https://example.com/image.jpg"
  }, "editor-id", testDate);

  // Keep the article in review after the editor saves a correction.
  assert.equal(article.status, "pending_review");
  // Store the new title in the private working version.
  assert.equal(article.workingVersion.title, "Edited title");
  // Keep the public version empty until explicit approval.
  assert.equal(article.publishedVersion, null);
  // Increase the revision counter after an editor change.
  assert.equal(article.revisionNumber, 2);
});

test("editor approval creates the first public version", () => {
  // Start with a complete article that has no public version yet.
  const article = makeArticle();

  // Approve the working version at a fixed time.
  approveArticle(article, "editor-id", testDate);

  // Move the article into the public state.
  assert.equal(article.status, "published");
  // Copy the working title to the public version.
  assert.equal(article.publishedVersion.title, "Original title");
  // Start publication numbering at version one.
  assert.equal(article.publishedVersion.versionNumber, 1);
  // Record which editor approved the version.
  assert.equal(article.publishedVersion.approvedBy, "editor-id");
  // Record the approval time in the public version.
  assert.equal(article.publishedVersion.publishedAt, testDate);
});

test("a pending update keeps the old public version until approval", () => {
  // Start with an article that already has a public version.
  const article = makeArticle();
  article.publishedVersion = {
    versionNumber: 1,
    title: "Public title",
    summary: "Public summary",
    content: "Public content",
    category: "News"
  };

  // Apply a new correction while the old public copy is still visible.
  applyEditorEdit(article, {
    title: "New title",
    summary: "New summary",
    content: "New content",
    category: "Technology"
  }, "editor-id", testDate);

  // Keep the old public title during the review step.
  assert.equal(article.publishedVersion.title, "Public title");
  // Store the new title only in the working version.
  assert.equal(article.workingVersion.title, "New title");

  // Approve the pending update.
  approveArticle(article, "editor-id", testDate);

  // Replace the public content only after approval.
  assert.equal(article.publishedVersion.title, "New title");
  // Increase the public version number for readers.
  assert.equal(article.publishedVersion.versionNumber, 2);
});

test("editor cannot approve an article outside the review queue", () => {
  // Create a draft that has not been submitted to the editor.
  const article = makeArticle("draft");

  // Confirm that the service blocks approval in the wrong state.
  assert.throws(
    () => approveArticle(article, "editor-id", testDate),
    (error) => error.statusCode === 409
  );
});

test("returning an article requires an editor note", () => {
  // Start with an article waiting for review.
  const article = makeArticle();

  // Confirm that an empty note is rejected.
  assert.throws(
    () => requestChanges(article, "editor-id", "", testDate),
    (error) => error.statusCode === 400
  );
  // Keep the article in review when the note is invalid.
  assert.equal(article.status, "pending_review");
});

test("returning an article stores the note and changes its status", () => {
  // Start with an article waiting for review.
  const article = makeArticle();

  // Return the article with a clear correction note.
  requestChanges(article, "editor-id", "Please add the source link.", testDate);

  // Move the article into the correction workflow state.
  assert.equal(article.status, "changes_requested");
  // Store the note so the reporter can read it.
  assert.equal(article.editorNote, "Please add the source link.");
  // Record which editor reviewed the article.
  assert.equal(article.reviewedBy, "editor-id");
});

test("editor validation rejects missing required fields", () => {
  // Confirm that title, content, and category are required for editor updates.
  assert.throws(
    () => validateEditorUpdate({ title: "", content: "Text", category: "News" }),
    (error) => error.statusCode === 400 && error.message.includes("title is required")
  );
});
