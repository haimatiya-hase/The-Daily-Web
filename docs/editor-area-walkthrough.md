# Haim's Editor Area Walkthrough

This document explains the editor work in simple English. The editor can
manage all articles, review submitted content, edit a pending article, publish
it, return it with a note, delete it, and compare public and working versions.

## Request flow

1. The browser opens `GET /editor`.
2. The server checks that the current user has the `editor` role.
3. `editor.ejs` returns the page structure.
4. `public/js/editor.js` asks the REST API for the article queue.
5. The editor selects an article and the browser loads both versions.
6. A button sends an AJAX request to the matching protected API route.
7. The controller loads the MongoDB document and calls the workflow service.
8. The workflow service checks the status and applies the business rule.
9. The controller saves the document and returns JSON.
10. The browser updates the visible screen without a full page reload.

## Files in this area

### `src/routes/editor.routes.js`

This file maps URLs to controller functions. Every route uses
`requireRole("editor")` before the controller. This means hiding a button in
the browser is not the security mechanism; the server checks the role first.

The routes are:

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/editor/articles` | List, search, filter, and paginate articles |
| GET | `/api/editor/articles/:articleId` | Read one article and both versions |
| PATCH | `/api/editor/articles/:articleId` | Save an editor correction |
| POST | `/api/editor/articles/:articleId/publish` | Approve and publish |
| POST | `/api/editor/articles/:articleId/request-changes` | Return with a note |
| DELETE | `/api/editor/articles/:articleId` | Delete an article |

### `src/controllers/editor.controller.js`

The controller connects HTTP requests to the model and service.

- `listArticles` reads `status`, `search`, `page`, and `limit` from the URL.
- `escapeRegex` makes a search value safe before MongoDB uses it.
- `findArticle` checks the ID and returns a clear 400 or 404 error.
- `serializeArticle` returns article data without exposing unrelated fields.
- `updateArticle` saves an editor correction but does not publish it.
- `publishArticle` calls the approval rule and then saves the new public copy.
- `requestArticleChanges` requires a note before changing the status.
- `deleteArticle` removes the selected article after the editor permission check.

Each asynchronous controller uses `try/catch` and passes errors to the common
error middleware with `next(error)`.

### `src/services/article-workflow.service.js`

This is the most important business-rule file. It does not know about HTML or
buttons, so it can be tested separately.

- `validateEditorUpdate` trims text, checks required fields, and checks limits.
- `applyEditorEdit` changes only `workingVersion` while the status is
  `pending_review`.
- `approveArticle` copies the working version into `publishedVersion` and
  changes the status to `published`.
- `requestChanges` stores the editor note and changes the status to
  `changes_requested`.
- `cloneVersion` prevents accidental sharing of the old version object.

The service rejects editor actions when the article is not `pending_review`.
This protects the workflow even if someone manually sends an HTTP request.

## Why two versions are needed

`workingVersion` is the version being reviewed. `publishedVersion` is the last
version readers are allowed to see. When an editor saves an edit, only the
working version changes. When an editor approves, the working version becomes
the new public version. This is how a published article can receive an update
without showing unfinished text to readers.

## Simple defense explanation

You can explain the feature like this:

> The editor page is protected by the editor role on the server. The browser
> uses AJAX to read and update articles. The controller handles HTTP details,
> while the workflow service contains the status rules. An editor can publish
> only a pending article, and returning an article requires a note. The model
> stores a working version and a published version, so readers never see an
> unapproved edit.

## How to test this part

Run these commands from the project folder:

```bash
npm run check
npm test
```

The workflow tests cover saving an edit, publishing, invalid status changes,
required notes, and required fields. The full editor API also requires a
configured MongoDB connection and the authentication work from the team.
