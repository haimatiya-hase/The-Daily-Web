const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const Comment = require("../src/models/comment.model"); // Load the shared model so its statics can be replaced safely.
const { hashClientKey } = require("../src/utils/client-key"); // Hash the test device exactly like the real service.
const commentService = require("../src/services/comment.service"); // Load the guest comment rules under test.
const { approveArticle } = require("../src/services/article-workflow.service"); // Load the approval flow that feeds the analytics markers.

test("a guest comment without a name or without text is rejected", async () => { // Verify server-side comment validation.
  await assert.rejects( // Reject a comment that has text but no name.
    () => commentService.createGuestComment({ articleId: "a1", payload: { guestName: " ", body: "שלום" }, clientKey: "device-1" }),
    (error) => error.statusCode === 400 // Expect a normal client validation error.
  );
  await assert.rejects( // Reject a comment that has a name but only spaces as text.
    () => commentService.createGuestComment({ articleId: "a1", payload: { guestName: "אורח", body: "   " }, clientKey: "device-1" }),
    (error) => error.statusCode === 400 // Expect a normal client validation error.
  );
});

test("the fourth comment in one minute from the same device is blocked", async (context) => { // Verify the required spam limit.
  const originalCount = Comment.countDocuments; // Keep the real database method for other tests.
  context.after(() => { Comment.countDocuments = originalCount; }); // Restore the real method when this test ends.
  let receivedFilter = null; // Record the rate-limit query sent to MongoDB.
  Comment.countDocuments = async (filter) => { receivedFilter = filter; return 3; }; // Simulate three comments already inside the window.

  await assert.rejects( // Expect the server to refuse the fourth comment.
    () => commentService.createGuestComment({ articleId: "a1", payload: { guestName: "אורח", body: "תגובה" }, clientKey: "device-1" }),
    (error) => error.statusCode === 429 // Expect the too-many-requests status required by the assignment.
  );
  assert.equal(receivedFilter.clientKeyHash, hashClientKey("device-1")); // Confirm the limit counts only this hashed device.
  assert.ok(receivedFilter.createdAt.$gte instanceof Date); // Confirm the limit looks back over a real time window.
  assert.ok(Date.now() - receivedFilter.createdAt.$gte.getTime() <= 61 * 1000); // Confirm the window is one minute long.
});

test("a stored comment keeps only the hashed device key and trimmed text", async (context) => { // Verify privacy and normalization.
  const originalCount = Comment.countDocuments; // Keep the real counting method.
  const originalCreate = Comment.create; // Keep the real creation method.
  context.after(() => { Comment.countDocuments = originalCount; Comment.create = originalCreate; }); // Restore both after the test.
  Comment.countDocuments = async () => 0; // Simulate a device with no recent comments.
  let storedDocument = null; // Record the document sent to MongoDB.
  Comment.create = async (doc) => { storedDocument = doc; return { _id: "c1", ...doc, createdAt: new Date() }; }; // Return a stored-comment shape.

  const comment = await commentService.createGuestComment({ // Create one valid comment through the service.
    articleId: "a1",
    payload: { guestName: "  איתי  ", body: "  כתבה מצוינת  " },
    clientKey: "device-9"
  });

  assert.equal(storedDocument.clientKeyHash, hashClientKey("device-9")); // Confirm only the hash reaches the database.
  assert.equal(storedDocument.clientKey, undefined); // Confirm the original device key is never stored.
  assert.equal(storedDocument.guestName, "איתי"); // Confirm the name was trimmed before saving.
  assert.equal(comment.body, "כתבה מצוינת"); // Confirm the public response returns the trimmed text.
  assert.equal(comment.clientKeyHash, undefined); // Confirm the hash never leaks into the public response.
});

test("approving an update appends one publication history marker", () => { // Verify the analytics marker source.
  const now = new Date("2026-09-08T14:00:00.000Z"); // Use a fixed approval time for exact assertions.
  const article = { // Build one pending update of an already published article.
    status: "pending_review",
    workingVersion: { versionNumber: 1, title: "כותרת", summary: "", content: "תוכן", imageUrl: "", category: "חדשות" },
    publishedVersion: { versionNumber: 1 },
    publicationHistory: [{ versionNumber: 1, publishedAt: new Date("2026-09-01T09:00:00.000Z") }]
  };

  approveArticle(article, "editor-1", now); // Approve the update exactly like the editor endpoint does.

  assert.equal(article.publicationHistory.length, 2); // Confirm the history now holds both publication points.
  assert.deepEqual(article.publicationHistory[1], { versionNumber: 2, publishedAt: now, approvedBy: "editor-1" }); // Confirm the new marker describes the approved update.
  assert.equal(article.publishedVersion.versionNumber, 2); // Confirm the public version advanced together with the marker.
});
