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
  const article = makeArticle();

  applyEditorEdit(article, {
    title: "Edited title",
    summary: "Edited summary",
    content: "Edited content",
    category: "Technology",
    imageUrl: "https://example.com/image.jpg"
  }, "editor-id", testDate);

  assert.equal(article.status, "pending_review");
  assert.equal(article.workingVersion.title, "Edited title");
  assert.equal(article.publishedVersion, null);
  assert.equal(article.revisionNumber, 2);
});

test("editor approval creates the first public version", () => {
  const article = makeArticle();

  approveArticle(article, "editor-id", testDate);

  assert.equal(article.status, "published");
  assert.equal(article.publishedVersion.title, "Original title");
  assert.equal(article.publishedVersion.versionNumber, 1);
  assert.equal(article.publishedVersion.approvedBy, "editor-id");
  assert.equal(article.publishedVersion.publishedAt, testDate);
});

test("a pending update keeps the old public version until approval", () => {
  const article = makeArticle();
  article.publishedVersion = {
    versionNumber: 1,
    title: "Public title",
    summary: "Public summary",
    content: "Public content",
    category: "News"
  };

  applyEditorEdit(article, {
    title: "New title",
    summary: "New summary",
    content: "New content",
    category: "Technology"
  }, "editor-id", testDate);

  assert.equal(article.publishedVersion.title, "Public title");
  assert.equal(article.workingVersion.title, "New title");

  approveArticle(article, "editor-id", testDate);

  assert.equal(article.publishedVersion.title, "New title");
  assert.equal(article.publishedVersion.versionNumber, 2);
});

test("editor cannot approve an article outside the review queue", () => {
  const article = makeArticle("draft");

  assert.throws(
    () => approveArticle(article, "editor-id", testDate),
    (error) => error.statusCode === 409
  );
});

test("returning an article requires an editor note", () => {
  const article = makeArticle();

  assert.throws(
    () => requestChanges(article, "editor-id", "", testDate),
    (error) => error.statusCode === 400
  );
  assert.equal(article.status, "pending_review");
});

test("returning an article stores the note and changes its status", () => {
  const article = makeArticle();

  requestChanges(article, "editor-id", "Please add the source link.", testDate);

  assert.equal(article.status, "changes_requested");
  assert.equal(article.editorNote, "Please add the source link.");
  assert.equal(article.reviewedBy, "editor-id");
});

test("editor validation rejects missing required fields", () => {
  assert.throws(
    () => validateEditorUpdate({ title: "", content: "Text", category: "News" }),
    (error) => error.statusCode === 400 && error.message.includes("title is required")
  );
});
