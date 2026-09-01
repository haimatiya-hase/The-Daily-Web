const test = require("node:test"); // Load Node's small built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for clear failures.
const Article = require("../src/models/article.model"); // Load the shared model so database calls can be replaced during controller tests.
const { buildWorkingVersion, canReporterEdit, createReporterArticle, saveReporterArticle, submitReporterArticle, validateSubmission } = require("../src/controllers/reporter.controller"); // Load the reporter actions and business rules being tested.

function createResponse() { // Build the small part of an Express response used by controller tests.
  return { // Return a mutable response object.
    statusCode: 200, // Start with the normal success status.
    body: null, // Store the JSON body sent by the controller.
    status(code) { this.statusCode = code; return this; }, // Save a chosen status and keep method chaining.
    json(body) { this.body = body; return this; } // Save the JSON body for assertions.
  };
}

function createArticleDocument(overrides = {}) { // Build a simple article that behaves like a saved Mongoose document.
  const values = { // Store the normal editable article values.
    _id: { toString: () => "507f1f77bcf86cd799439011" }, // Provide a stable article ID.
    status: "draft", // Start in the editable draft state.
    workingVersion: { versionNumber: 1, title: "כותרת", summary: "תקציר", category: "חדשות", imageUrl: "/image.svg", content: "תוכן", createdAt: new Date() }, // Provide a complete working version.
    publishedVersion: null, // Start without a public version.
    editorNote: "", // Start without an editor note.
    revisionNumber: 1, // Start with the first revision.
    updatedAt: new Date(), // Provide a dashboard save time.
    async save() { this.updatedAt = new Date(); }, // Simulate a successful MongoDB save.
    toObject() { return { ...this }; } // Simulate conversion into a plain object.
  };
  return Object.assign(values, overrides); // Apply the values needed by one focused test.
}

test("reporter can edit only allowed workflow states", () => { // Verify the reporter status permissions.
  assert.equal(canReporterEdit("draft"), true); // Allow editing a new draft.
  assert.equal(canReporterEdit("changes_requested"), true); // Allow fixing an article returned by the editor.
  assert.equal(canReporterEdit("published"), true); // Allow preparing an update to a published article.
  assert.equal(canReporterEdit("pending_review"), false); // Block edits while the editor reviews the article.
});

test("submission requires every visible article field", () => { // Verify the simple submission validation.
  const completeSnapshot = { title: "כותרת", summary: "תקציר", category: "חדשות", imageUrl: "/image.svg", content: "תוכן" }; // Build one complete article version.
  assert.equal(validateSubmission(completeSnapshot), null); // Accept a complete article.
  assert.match(validateSubmission({ ...completeSnapshot, title: "" }), /כותרת/); // Reject a missing title.
  assert.match(validateSubmission({ ...completeSnapshot, summary: "" }), /תקציר/); // Reject a missing summary.
  assert.match(validateSubmission({ ...completeSnapshot, category: "" }), /קטגוריה/); // Reject a missing category.
  assert.match(validateSubmission({ ...completeSnapshot, imageUrl: "" }), /תמונה/); // Reject a missing image.
  assert.match(validateSubmission({ ...completeSnapshot, content: "" }), /תוכן/); // Reject a missing article body.
});

test("submission rejects an article field that is too long", () => { // Verify server-side maximum length validation.
  const oversizedSnapshot = { title: "x".repeat(181), summary: "תקציר", category: "חדשות", imageUrl: "/image.svg", content: "תוכן" }; // Build a complete article with an oversized title.
  assert.match(validateSubmission(oversizedSnapshot), /ארוך מדי/); // Return a clear validation message before MongoDB writes it.
});

test("editing a published article starts a private newer version", () => { // Verify public content protection during reporter edits.
  const publishedAt = new Date("2026-01-01T10:00:00.000Z"); // Use a fixed public date for the example.
  const article = { status: "published", workingVersion: { versionNumber: 2, createdAt: publishedAt }, publishedVersion: { versionNumber: 2, publishedAt } }; // Build an article whose working and public versions match.
  const input = { title: "כותרת חדשה", summary: "תקציר חדש", category: "תרבות", imageUrl: "/new.svg", content: "תוכן חדש" }; // Build the reporter's updated fields.
  const result = buildWorkingVersion(article, input); // Start the private update.
  assert.equal(result.versionNumber, 3); // Give the update a version newer than the public version.
  assert.equal(result.title, input.title); // Keep the reporter's new title.
  assert.equal(result.submittedAt, null); // Keep the update private until submission.
  assert.equal(article.publishedVersion.versionNumber, 2); // Leave the approved public version unchanged.
});

test("autosave keeps the same version number for an existing draft", () => { // Verify repeated saves do not create extra versions.
  const createdAt = new Date("2026-02-01T10:00:00.000Z"); // Use a fixed draft creation date.
  const article = { status: "draft", workingVersion: { versionNumber: 1, createdAt }, publishedVersion: null }; // Build a normal first draft.
  const result = buildWorkingVersion(article, { title: " טיוטה ", summary: " תקציר ", category: " חדשות ", imageUrl: " /image.svg ", content: " תוכן " }); // Autosave fields that contain extra spaces.
  assert.equal(result.versionNumber, 1); // Keep the current draft version number.
  assert.equal(result.createdAt, createdAt); // Keep the original draft creation time.
  assert.equal(result.title, "טיוטה"); // Trim surrounding spaces from saved text.
});

test("malformed reporter input becomes an empty safe draft", () => { // Verify null request bodies cannot crash the version builder.
  const article = { status: "draft", workingVersion: { versionNumber: 1, createdAt: new Date() }, publishedVersion: null }; // Build a normal draft shell.
  const result = buildWorkingVersion(article, null); // Simulate a JSON null body from a client.
  assert.equal(result.title, ""); // Convert the invalid body into a safe empty title.
  assert.equal(result.content, ""); // Convert the invalid body into a safe empty body.
});

test("create action always assigns the logged-in reporter as owner", async (context) => { // Verify server-side ownership during article creation.
  const originalCreate = Article.create; // Keep the real model method for later tests.
  context.after(() => { Article.create = originalCreate; }); // Restore the real model method after this test.
  let insertedValues = null; // Store the values passed to the fake database.
  Article.create = async (values) => { insertedValues = values; return createArticleDocument(); }; // Replace MongoDB insertion with a small in-memory result.
  const req = { user: { _id: "reporter-123" } }; // Simulate the authenticated reporter request.
  const res = createResponse(); // Create a response collector.
  let forwardedError = null; // Store an unexpected forwarded error.
  await createReporterArticle(req, res, (error) => { forwardedError = error; }); // Run the real controller action.
  assert.equal(forwardedError, null); // Confirm that no error reached middleware.
  assert.equal(insertedValues.author, "reporter-123"); // Confirm that ownership came from the session user.
  assert.equal(insertedValues.status, "draft"); // Confirm that every new article starts as a draft.
  assert.equal(res.statusCode, 201); // Confirm the REST create status.
  assert.match(res.body.editUrl, /^\/reporter\/articles\//); // Confirm that the browser receives the editor link.
});

test("autosave query protects ownership and updates only the working version", async (context) => { // Verify secure reporter autosave behavior.
  const originalFindOne = Article.findOne; // Keep the real model method for later tests.
  context.after(() => { Article.findOne = originalFindOne; }); // Restore the real model method after this test.
  const article = createArticleDocument(); // Create one owned editable article.
  let ownershipQuery = null; // Store the MongoDB filter used by the controller.
  Article.findOne = async (query) => { ownershipQuery = query; return article; }; // Return the fake article and capture the security filter.
  const req = { params: { articleId: "507f1f77bcf86cd799439011" }, user: { _id: "reporter-123" }, body: { title: "כותרת מעודכנת", summary: "תקציר", category: "חדשות", imageUrl: "/image.svg", content: "תוכן" } }; // Simulate one autosave request.
  const res = createResponse(); // Create a response collector.
  let forwardedError = null; // Store an unexpected forwarded error.
  await saveReporterArticle(req, res, (error) => { forwardedError = error; }); // Run the real autosave controller.
  assert.equal(forwardedError, null); // Confirm that no error reached middleware.
  assert.equal(ownershipQuery.author, "reporter-123"); // Confirm that the database query includes the logged-in reporter.
  assert.equal(article.workingVersion.title, "כותרת מעודכנת"); // Confirm that the private working title changed.
  assert.equal(res.body.message, "הטיוטה נשמרה."); // Confirm the API success response.
});

test("submit action moves a complete draft to editor review", async (context) => { // Verify the reporter-to-editor workflow transition.
  const originalFindOne = Article.findOne; // Keep the real model method for later tests.
  context.after(() => { Article.findOne = originalFindOne; }); // Restore the real model method after this test.
  const article = createArticleDocument({ editorNote: "הערה ישנה" }); // Create a complete corrected draft.
  Article.findOne = async () => article; // Return the fake owned article.
  const req = { params: { articleId: "507f1f77bcf86cd799439011" }, user: { _id: "reporter-123" } }; // Simulate a submit request.
  const res = createResponse(); // Create a response collector.
  let forwardedError = null; // Store an unexpected forwarded error.
  await submitReporterArticle(req, res, (error) => { forwardedError = error; }); // Run the real submission controller.
  assert.equal(forwardedError, null); // Confirm that no error reached middleware.
  assert.equal(article.status, "pending_review"); // Confirm the allowed transition to editor review.
  assert.equal(article.editorNote, undefined); // Confirm that the old correction note is cleared.
  assert.ok(article.workingVersion.submittedAt instanceof Date); // Confirm that the submission time is stored.
  assert.match(res.body.message, /נשלחה/); // Confirm the API success message.
});
