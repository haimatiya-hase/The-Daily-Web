const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const Comment = require("../src/models/comment.model"); // Load the shared model so its statics can be replaced safely.
const commentService = require("../src/services/comment.service"); // Load the pagination and moderation rules under test.

// Build the small Mongoose query chain that the service uses for list queries.
const createQuery = (documents, calls) => ({
  populate(path, fields) { calls.populate = { path, fields }; return this; }, // Record the article population.
  sort(value) { calls.sort = value; return this; }, // Record the ordering.
  limit(value) { calls.limit = value; return this; }, // Record the page size.
  async lean() { return documents; } // Return the simulated documents.
});

// Build one stored comment with the fields that the service reads.
const createDocument = (index, extra = {}) => ({
  _id: `64f0000000000000000000${String(index).padStart(2, "0")}`,
  guestName: `אורח ${index}`,
  body: `תגובה ${index}`,
  createdAt: new Date(Date.UTC(2026, 8, 1, 12, 0, index)),
  deletedAt: null,
  ...extra
});

test("a cursor survives a round trip and a malformed cursor is rejected with 400", () => { // Verify the pagination keys stay safe.
  const comment = createDocument(7); // Use one stored comment as the last item of a page.
  const cursor = commentService.createCursor(comment); // Encode its sort keys.
  const decoded = commentService.readCursor(cursor); // Decode them again.

  assert.equal(decoded.createdAt.toISOString(), comment.createdAt.toISOString()); // Confirm the time key is preserved exactly.
  assert.equal(String(decoded.id), comment._id); // Confirm the id key is preserved exactly.
  assert.equal(commentService.readCursor(""), null); // Confirm a missing cursor means the first page.
  assert.throws(() => commentService.readCursor("not-base64-json"), (error) => error.statusCode === 400); // Confirm bad input becomes a client error.
});

test("the public thread returns one page, hides deleted comments, and reports the next cursor", async (context) => { // Verify the load-more contract.
  const originalFind = Comment.find; // Keep the real query method.
  context.after(() => { Comment.find = originalFind; }); // Restore it after the test.
  const calls = {}; // Record how the service queried MongoDB.
  const documents = Array.from({ length: commentService.COMMENT_PAGE_SIZE + 1 }, (_, index) => createDocument(index + 1)); // Return one extra document.
  Comment.find = (filter) => { calls.filter = filter; return createQuery(documents, calls); }; // Replace MongoDB with the recorded query.

  const page = await commentService.listArticleComments("a1"); // Read the first page of one article.

  assert.deepEqual(calls.filter, { article: "a1", deletedAt: null }); // Confirm hidden comments never reach readers.
  assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 }); // Confirm newest-first with a stable tie breaker.
  assert.equal(calls.limit, commentService.COMMENT_PAGE_SIZE + 1); // Confirm one extra row is read only to detect another page.
  assert.equal(page.comments.length, commentService.COMMENT_PAGE_SIZE); // Confirm exactly one page is returned.
  assert.equal(page.hasMore, true); // Confirm the browser learns that another page exists.
  assert.equal(typeof page.nextCursor, "string"); // Confirm a URL-safe cursor is returned.
  assert.equal(page.comments[0].clientKeyHash, undefined); // Confirm the device hash never leaks into the public shape.
});

test("a cursor page continues strictly after the previous comment", async (context) => { // Verify pagination is stable under new inserts.
  const originalFind = Comment.find; // Keep the real query method.
  context.after(() => { Comment.find = originalFind; }); // Restore it after the test.
  const calls = {}; // Record the filter of the second page.
  Comment.find = (filter) => { calls.filter = filter; return createQuery([], calls); }; // Return an empty final page.
  const last = createDocument(20); // Simulate the last comment of the first page.

  const page = await commentService.listArticleComments("a1", { cursor: commentService.createCursor(last) }); // Ask for the next page.

  assert.ok(Array.isArray(calls.filter.$or)); // Confirm the range continues after the cursor instead of using skip.
  assert.equal(calls.filter.$or[0].createdAt.$lt.toISOString(), last.createdAt.toISOString()); // Confirm older comments come first.
  assert.equal(String(calls.filter.$or[1]._id.$lt), last._id); // Confirm the id breaks ties for equal times.
  assert.equal(page.hasMore, false); // Confirm the final page hides the button.
  assert.equal(page.nextCursor, null); // Confirm no cursor is returned on the final page.
});

test("the moderation queue applies search and visibility filters and counts the whole result", async (context) => { // Verify Read (List/Search) for the Comment model.
  const originalFind = Comment.find; // Keep the real query method.
  const originalCount = Comment.countDocuments; // Keep the real count method.
  context.after(() => { Comment.find = originalFind; Comment.countDocuments = originalCount; }); // Restore both after the test.
  const calls = {}; // Record the queries.
  const hidden = createDocument(3, { deletedAt: new Date(), article: { _id: "art1", publishedVersion: { title: "כותרת ציבורית" } } }); // Provide one populated hidden comment.
  Comment.find = (filter) => { calls.filter = filter; return createQuery([hidden], calls); }; // Return the single match.
  Comment.countDocuments = async (filter) => { calls.countFilter = filter; return 1; }; // Return the total of the filtered result.

  const page = await commentService.listCommentsForModeration({ search: "  עדכון  ", status: "deleted" }); // Search hidden comments.

  assert.deepEqual(calls.filter, { deletedAt: { $ne: null }, $text: { $search: "עדכון" } }); // Confirm both filters reach MongoDB with trimmed search text.
  assert.deepEqual(calls.countFilter, calls.filter); // Confirm the total describes the same filtered result.
  assert.equal(calls.populate.path, "article"); // Confirm the article title is loaded for context.
  assert.equal(page.total, 1); // Confirm the count is returned.
  assert.equal(page.comments[0].article.title, "כותרת ציבורית"); // Confirm the public title is preferred.
  assert.deepEqual(page.filters, { search: "עדכון", status: "deleted" }); // Confirm the normalized filters are echoed back.
});

test("an unknown visibility filter falls back to visible comments only", async (context) => { // Verify bad query input cannot widen the result.
  const originalFind = Comment.find; // Keep the real query method.
  const originalCount = Comment.countDocuments; // Keep the real count method.
  context.after(() => { Comment.find = originalFind; Comment.countDocuments = originalCount; }); // Restore both after the test.
  const calls = {}; // Record the filter.
  Comment.find = (filter) => { calls.filter = filter; return createQuery([], calls); }; // Return an empty page.
  Comment.countDocuments = async () => 0; // Return an empty total.

  const page = await commentService.listCommentsForModeration({ status: "everything" }); // Send a value the dropdown never produces.

  assert.deepEqual(calls.filter, { deletedAt: null }); // Confirm only visible comments are listed.
  assert.equal(page.filters.status, "visible"); // Confirm the fallback is reported.
});

test("hiding, editing, and restoring record the acting editor and reject missing comments", async (context) => { // Verify the moderation audit trail.
  const originalUpdate = Comment.findOneAndUpdate; // Keep the real update method.
  context.after(() => { Comment.findOneAndUpdate = originalUpdate; }); // Restore it after the test.
  const calls = []; // Record every moderation update.
  let nextResult = createDocument(5, { article: { _id: "art1", workingVersion: { title: "טיוטה" } } }); // Return a populated comment by default.
  Comment.findOneAndUpdate = (filter, update, options) => { // Replace MongoDB with a recorder.
    calls.push({ filter, update, options });
    return { populate() { return this; }, async lean() { return nextResult; } };
  };

  const hidden = await commentService.softDeleteComment("c5", "editor-1"); // Hide one comment.
  assert.deepEqual(calls[0].filter, { _id: "c5", deletedAt: null }); // Confirm only a visible comment can be hidden.
  assert.ok(calls[0].update.$set.deletedAt instanceof Date); // Confirm soft deletion stores a time instead of removing the row.
  assert.equal(calls[0].update.$set.moderatedBy, "editor-1"); // Confirm the acting editor is recorded.
  assert.equal(hidden.article.title, "טיוטה"); // Confirm the working title is used when there is no public title.

  await commentService.restoreComment("c5", "editor-1"); // Restore the same comment.
  assert.deepEqual(calls[1].filter, { _id: "c5", deletedAt: { $ne: null } }); // Confirm only a hidden comment can be restored.
  assert.equal(calls[1].update.$set.deletedAt, null); // Confirm restoring clears the deletion time.

  await commentService.updateCommentBody("c5", "  טקסט מתוקן  ", "editor-1"); // Correct the text.
  assert.equal(calls[2].update.$set.body, "טקסט מתוקן"); // Confirm the text is trimmed before saving.
  await assert.rejects(() => commentService.updateCommentBody("c5", "   ", "editor-1"), (error) => error.statusCode === 400); // Confirm an empty correction is rejected.

  nextResult = null; // Simulate a comment that does not exist.
  await assert.rejects(() => commentService.restoreComment("missing", "editor-1"), (error) => error.statusCode === 404); // Confirm a clear 404 instead of a crash.
});
