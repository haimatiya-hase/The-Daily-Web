# Itay Article, Comments, Views, and Analytics Walkthrough

This document explains the public article experience and the statistics behind
it in simple terms for development, code review, and the project defense.

## Responsibility

This area owns everything a reader meets after clicking an article, and
everything the newsroom learns from those readers:

- the public article page, rendered on the server for search engines;
- guest comments with the three-per-minute limit enforced on the server;
- comment moderation for editors (search, edit, hide, restore);
- counting every article entry and storing it in a way that stays fast for
  thousands of parallel readers;
- the editor statistics screen with full CRUD on the statistics model;
- the Impact Analytics graph with publication markers and before/after numbers;
- uploading an article image from the reporter's computer.

## Files

| Layer | Files |
| --- | --- |
| Models | `src/models/comment.model.js`, `src/models/view-event.model.js`, `src/models/view-stat.model.js`, `publicationHistory` in `src/models/article.model.js` |
| Services | `src/services/comment.service.js`, `src/services/view.service.js`, `src/services/analytics.service.js`, `src/services/upload.service.js` |
| Controllers | `src/controllers/article.controller.js`, `comment.controller.js`, `view.controller.js`, `analytics.controller.js`, `upload.controller.js` |
| Routes | `src/routes/comment.routes.js`, `view.routes.js`, `analytics.routes.js`, `upload.routes.js`, plus the public article routes in `api.routes.js` and `web.routes.js` |
| Views | `src/views/pages/article.ejs`, `comments.ejs`, `views.ejs` |
| Browser | `public/js/article.js`, `comments-moderation.js`, `views.js`, `analytics.js` |
| Shared helpers | `src/utils/client-key.js` (device key, cookie, hashing) |

## Request flow: the article page

1. `GET /articles/:articleId` reaches `article.controller.js`.
2. The controller loads only `publishedVersion` of an article that has been
   approved at least once. A pending update never leaks to readers.
3. The visit is counted **before** rendering through `view.service.js`
   (see "Counting views"). A statistics failure is logged and never breaks
   the page.
4. The first twenty comments and the real comment total are loaded.
5. `article.ejs` renders the full content, escaped paragraph by paragraph, so
   the complete article is in the initial HTML without any JavaScript.
6. `article.js` adds the AJAX comment form and the load-more button.

## Comments

- `POST /api/articles/:articleId/comments` validates the name and text, hashes
  the device key with SHA-256, counts the comments of that hash in the last
  sixty seconds, and rejects the fourth one with **429** and a Hebrew message.
  The browser check is only for fast feedback; the server decides.
- `GET /api/articles/:articleId/comments?cursor=` returns one page of twenty.
  The cursor is `createdAt` plus `_id`, so a page stays correct while new
  comments arrive and no `skip` is used.
- Editors moderate on `/editor/comments` through `/api/comments`: text search
  (MongoDB text index on body and guest name), visible/hidden filter, inline
  edit, hide (soft delete), restore. Every action stores `moderatedBy` and
  `moderatedAt` and writes a log line.

## Counting views

Every entry is counted on the server while the page renders, not by a browser
beacon, so it works without JavaScript. Crawlers are skipped by user agent and
the skip is logged. The device is identified by a first-party cookie
(`dailyWebDeviceKey`, one year, SameSite=Lax) created on the first visit; the
article page copies it into `localStorage`, so the home feed's viewed/unviewed
filter matches the recorded events without changes to the feed code.

One view is three small writes that run together:

| Store | Purpose | Cost |
| --- | --- | --- |
| `ViewEvent` (one per visit) | device-level questions such as "already viewed"; expires after 180 days | one insert |
| `ViewStat` (one per article per hour) | charts and recent activity; keeps a per-version breakdown | one atomic `$inc` upsert |
| `Article.viewCount` | popularity sort on the home feed | one atomic `$inc` |

Charts read the hourly buckets, so they touch a handful of documents no matter
how many readers the site has. This is the answer to "decide how to collect,
represent, and store the data for thousands of parallel readers".

## Statistics CRUD (`/editor/views`, `/api/views`)

| Operation | Route | What it does |
| --- | --- | --- |
| Read (list/search) | `GET /api/views?search=&sort=&page=` | published articles with total / 24h / 7d views, eight per page |
| Read (detail) | `GET /api/views/:articleId` | totals, recent activity, per-version breakdown, drift warning |
| Update | `POST /api/views/:articleId/rebuild` | recompute buckets and counter from the raw events |
| Delete | `DELETE /api/views/:articleId` | remove every view record of the article |
| Create | happens on every article visit | |

## Impact Analytics (`GET /api/analytics/:articleId?range=`)

- Ranges `24h` and `7d` are hourly; `30d` and `all` are daily. Gaps are filled
  with zeros so quiet hours are visible.
- Every publication from `publicationHistory` becomes a marker. For each
  update the API also returns the views in the 24 hours before and after and
  the percentage change, so the impact is stated in numbers.
- `analytics.js` draws the line with Chart.js (served locally from
  `node_modules`, no CDN), renders range buttons, and draws the dashed labeled
  marker lines with a small inline plugin. The same script powers the panel in
  the editor screen and the statistics page.

## Image upload

`POST /api/uploads/images` accepts the raw image body (Express `express.raw`,
no upload library), checks the real file signature against the declared type,
limits size to 5MB, allows only JPG/PNG/WebP/GIF, and stores the file under a
random name in `public/uploads/`. The reporter form's file picker uploads on
selection, fills the address field, previews the image, and triggers autosave.

## Security and errors

- Every moderation, statistics, analytics, and upload route runs through
  `requireRole("editor")` or `requireRole("reporter", "editor")` on the server.
- Malformed ids return 404, bad input returns 400, missing login returns 401 as
  JSON for API calls and as a page for browser requests.
- All API responses carry `Cache-Control: no-store`, so counters are fresh
  after back/forward navigation.
- Browser code builds DOM nodes with `textContent`; comment text is never
  inserted as HTML.

## Indexes

- Comments: `{article, deletedAt, createdAt, _id}` for public pages,
  `{deletedAt, createdAt, _id}` for the moderation queue, `{clientKeyHash,
  createdAt}` for the rate limit, text index on `body` and `guestName`.
- View events: `{article, viewedAt}`, `{clientKeyHash, article}` (sparse), TTL
  on `viewedAt`.
- View buckets: unique `{article, bucketStart}`, `{bucketStart}`.

## Verification

- `npm test` covers comment validation and the rate limit, cursor pagination,
  moderation filters and audit, the three-write view path, crawler skipping,
  statistics list/rebuild/delete, analytics series and impact math, HTTP
  guards, local Chart.js serving, and upload validation.
- Manual checks: fourth comment blocked with 429; load-more appends and hides
  on the last page; bot UA not counted, browser UA counted once; rebuild
  repairs drift; reset zeroes an article; chart ranges, tooltips, markers,
  mobile layout; upload of a real PNG, a fake PNG, and an unsupported type.

## Short defense explanation

"When a reader opens an article the server renders the approved version, counts
the visit, and sends the first comments in the HTML. A comment goes through
AJAX, and the server blocks the fourth one per minute from the same device.
Each view is stored three ways for three questions: a raw event for 'already
viewed', an hourly bucket for the graph, and a counter for popularity. Editors
manage comments and statistics on their own screens, and the Impact Analytics
graph shows views over time with a marker at every published update and the
numbers before and after it."

## Questions the lecturer may ask

- **Why count on the server and not in the browser?** The spec says every
  entry counts; a browser beacon is lost without JavaScript. Crawlers are
  filtered by user agent so the numbers describe readers.
- **Why three stores for one view?** Each answers a different question at O(1)
  cost. Raw events alone would force the chart to scan everything ever
  recorded; a counter alone cannot draw a timeline or a per-device filter.
- **Why hourly buckets?** The spec's example is an update at 14:00; daily
  totals cannot show before and after within a day.
- **Why cursor pagination for comments?** `skip` gets slower with depth and
  shifts when new comments arrive; a cursor continues after an exact comment.
- **How is the rate limit per device?** A random key is hashed with SHA-256
  and stored with each comment; the server counts recent comments of that
  hash. Without browser storage it falls back to the cookie, then the address.
- **Why is the upload done without multer?** It was not taught; Express's own
  raw parser plus a signature check is enough and keeps the dependency list
  to what the course covers. Chart.js is explicitly allowed by the spec.
- **What happens if MongoDB is slow while recording a view?** The write is
  awaited inside a try/catch; a failure is logged and the article still
  renders.
