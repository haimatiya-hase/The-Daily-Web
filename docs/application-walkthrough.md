# Application walkthrough

This is the current, simple-English code map. The original requirements and
team division remain separate source documents.

## 1. One request through the system

```text
Browser -> Middleware -> Route -> Controller -> Service / Model -> MongoDB
                                          -> HTML or JSON -> Browser
```

- `src/server.js`: connect to MongoDB, start listening, and close cleanly.
- `src/app.js`: connect middleware and routers; serve CSS, scripts, uploads,
  and local Chart.js; register error handlers last.
- `src/config/environment.js`: load `.env` and expose settings. `PORT` defaults
  to 3000. Existing shell environment values take priority over `.env`.
- `src/config/database.js`: open/close the connection and report database health.
  An available HTTP server does not prove MongoDB is connected.
- Routes map a URL and HTTP method to a handler. Controllers handle HTTP
  details; services hold reusable rules; models describe stored data.
- EJS generates HTML on the server. `public/js/` adds browser behavior.

## 2. Login, logout, and permissions - Liri

| Action | Code path |
| --- | --- |
| Login page | `GET /login` -> `auth.controller.showLogin` -> `login.ejs` |
| Submit login | `POST /login` -> `auth.controller.login` -> password and session helpers |
| Logout | `POST /logout` -> `auth.controller.logout` -> `destroySession` |
| Protect an action | `auth.middleware.js` -> `requireRole(...)` before the controller |

`User` stores username, display name, role, and password hash. `password.js`
uses salted `scrypt`; the real password is not stored as text. Login explicitly
reads the normally hidden hash. Failed logins share one generic error message.

`createSession` makes a random token. MongoDB stores its SHA-256 hash in
`Session`; the usable token travels in an `HttpOnly` cookie. The default
lifetime is seven days. Expiry is checked on lookup; a TTL index also removes
old sessions. The cookie uses `SameSite=Lax` and `Secure` in production.
Logout ends this browser session, not every session of that user.

A guest has no valid session. Stored roles are `reporter` and `editor`.
Missing login and wrong-role API requests return 401 and 403 respectively.
Hiding a button is not security: permissions are checked on the server.
There is no complete User CRUD API yet; see the requirements audit.

## 3. Public feed - Bremer

`GET /` -> `home.controller.showHome` -> `home.ejs`.
`public/js/home.js` loads cards from `GET /api/articles`.
`getPublicFeed` validates the query and reads approved versions only.
An article with a pending update still shows its earlier approved version.

| Control | Query or behavior |
| --- | --- |
| Search | `search`: approved title and summary; maximum 100 characters |
| Category | `category`: one of the five supported news categories |
| Viewed filter | `viewStatus=viewed` or `unviewed`; anonymous browser key |
| Sort | `sort=publishedAt` or `popularity` |
| More cards | `cursor`: continue after the last result; up to 20 cards per request |
| Reset | Clear controls/cursor and request the first results again |

Search waits briefly after typing; filter and sort changes use AJAX.
`IntersectionObserver` requests the next page near the bottom. Older AJAX
responses are ignored when a newer search starts. Loading, empty, retry, and
final-page states stay on the same page.

The cursor contains sorting values and the article ID as a tie breaker.
Compound indexes match date, popularity, and category queries; a text index
supports search. This avoids deep `skip` for the feed. Live changes to sorting
values can move records between pages: this is not an immutable snapshot.

## 4. Weather - Liri

`home.js` -> `GET /api/weather` -> `weather.service.getWeather` -> Open-Meteo.
The URL and location come from configuration. The default location is
Jerusalem, not the visitor's GPS location. This code does not require an API key.

The server requests temperature and weather code and caches successful data
in memory for 15 minutes by default (`WEATHER_CACHE_MINUTES`). On the next
request after expiry it fetches again. Failures produce an unavailable state.

A server cache is not a browser refresh timer. An already open home page does
not periodically fetch weather yet; do not claim a maximum display age there.

## 5. Reporter workspace - Dor

Pages: `/reporter` and `/reporter/articles/:articleId`.
Files: `reporter.controller.js`, `reporter.ejs`, `reporter-edit.ejs`,
`reporter.js`, and `Article`. API routes are in `api.routes.js` and require
the reporter role.

| Action | Handler / API |
| --- | --- |
| List own articles | `listReporterArticles`; `GET /api/reporter/articles` |
| New draft | `createReporterArticle`; `POST /api/reporter/articles` |
| Read own article | `getReporterArticle`; `GET /api/reporter/articles/:articleId` |
| Autosave | `saveReporterArticle`; `PUT /api/reporter/articles/:articleId` |
| Save while leaving | Same handler; `POST /api/reporter/articles/:articleId/autosave` |
| Submit | `submitReporterArticle`; `POST /api/reporter/articles/:articleId/submit` |

Creation takes `author` from the logged-in user. Lookup also filters by author,
so guessing another article ID does not give access. A new draft starts empty,
including the image URL. Choose or upload a real image before submission.

`canReporterEdit` permits draft, changes-requested, and published-update work,
not edits during `pending_review`. `buildWorkingVersion` starts a newer private
version for a published article. Submission validates all required fields.

Autosave runs 800 milliseconds after a typing pause. `visibilitychange` and
`pagehide` attempt a last save, using `sendBeacon` on page exit. Only a successful
save proves MongoDB received the draft; network failure can still lose changes.

## 6. Editor control room - Haim

`/editor` -> `showEditorDashboard` -> `editor.ejs` -> `editor.js`.
`editor.routes.js` checks the editor role on every API route.
Controller: `editor.controller.js`. Rules: `article-workflow.service.js`.

| Button or control | Handler / API |
| --- | --- |
| Search, status, page | `listArticles`; `GET /api/editor/articles` |
| Select article | `getArticle`; `GET /api/editor/articles/:articleId` |
| Save correction | `updateArticle` -> `applyEditorEdit`; `PATCH /api/editor/articles/:articleId` |
| Approve/publish | `publishArticle` -> `approveArticle`; `POST .../:articleId/publish` |
| Return with note | `requestArticleChanges` -> `requestChanges`; `POST .../:articleId/request-changes` |
| Delete | `deleteArticle`; `DELETE /api/editor/articles/:articleId` |

`workingVersion` is private work; `publishedVersion` is the last approved copy.
Saving a correction is not publishing. Review actions require `pending_review`.
Approval copies the working version, records `publicationHistory`, and makes
approved content public. Returning work requires a correction note.

Deletion removes the Article document, not all linked comments, views, or
uploaded files. Do not claim cascading deletion.

## 7. Article, comments, and image upload - Itay

`GET /articles/:articleId` -> `article.controller.showArticle` -> `article.ejs`.
The full approved content and first 20 visible comments are in the initial HTML.
Reader content is escaped; browser code uses text nodes, not guest text as HTML.
`article.js` adds AJAX comments and load-more.

| Action | Route |
| --- | --- |
| Read comments | `GET /api/articles/:articleId/comments?cursor=...` |
| Add guest comment | `POST /api/articles/:articleId/comments` |
| Moderation page | `GET /editor/comments` |
| Search queue | `GET /api/comments?search=...&status=...&cursor=...` |
| Edit, hide, restore | `PATCH /api/comments/:commentId`, `DELETE` there, `POST .../:commentId/restore` |
| Upload image | `POST /api/uploads/images` |

`comment.service.js` validates input and counts comments for the same anonymous
key in the last 60 seconds. The fourth returns 429. The limit applies across
articles, not three on every article. Count-then-insert is not atomic; concurrent
requests and replacement keys are limitations. Moderation records the editor
and time. Hiding is soft deletion and can be restored. The editor screen uses
`comments-moderation.js`.

`upload.routes.js` accepts raw bytes after checking the role.
`upload.service.saveImage` checks JPG/PNG/WebP/GIF signatures and declared type,
limits images to 5MB, and stores a random filename in `public/uploads/`.
The picker fills the URL, previews the image, and triggers autosave.

## 8. Views and Impact Analytics - Itay

`showArticle` calls `recordArticleView` while rendering the article. Known
crawler user-agent patterns are skipped. A recording failure is logged and
does not block the page. This counts entries, not unique people.

`client-key.js` handles the random first-party browser cookie and its SHA-256
hash. Browser code syncs the cookie with localStorage; feed requests also send
`X-Client-Key`. This is not a login token or physical-device identity.
Incognito normally starts as a guest with separate browser storage.

| Store | Why it exists |
| --- | --- |
| `ViewEvent` | One raw entry, browser-key hash, time, version; TTL after 180 days |
| `ViewStat` | One article-hour bucket with counts, including per-version counts |
| `Article.viewCount` | Total used for popularity sorting |

Each visit has three separate writes, including atomic counter increments.
They are not one transaction. Buckets reduce chart reads but grow with time.

`/editor/views` -> view controller/service -> `views.ejs` / `views.js`:
list/search, inspect totals and versions, rebuild with
`POST /api/views/:articleId/rebuild`, reset with `DELETE /api/views/:articleId`.
Rebuild uses retained events only; it cannot recover expired history.
Reset deletes the selected article's view data.

`GET /api/analytics/:articleId?range=24h|7d|30d|all` requires an editor.
`analytics.service.getArticleAnalytics` builds hourly/daily series, fills gaps,
and returns publication markers and 24-hour before/after figures.
`analytics.js` draws the locally served Chart.js graph. Hourly buckets make
mid-hour comparisons approximate; changed views do not prove causation.

## 9. Errors, tests, and demonstration data

- `http-error.js`: status and safe message for expected failures.
- `error.middleware.js`: HTML or JSON error response.
- `logger.js`: structured JSON to process output, not a log-file archive.
- `scripts/check-syntax.js`: parse our JavaScript without running the app.
- `test/`: all automated tests, including the reporter controller tests.
- `scripts/seed-demo.js`: required demo data, not obsolete code. Rerunning it
  replaces marked content and related comments/views; read MongoDB setup first.

```bash
npm run check
npm test
```

These checks do not replace browser, load, or submission checks. See the
[requirements audit](requirements-traceability.md) for remaining gaps.
