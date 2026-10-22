# The Daily Web

> A modern newsroom workflow for writing, reviewing, publishing, and understanding digital news.

<p align="center">
  <strong>Reporter workspace</strong> · <strong>Editor control room</strong> · <strong>Public news experience</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20 or newer">
  <img src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white" alt="Express 4">
  <img src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white" alt="MongoDB with Mongoose">
  <img src="https://img.shields.io/badge/UI-EJS%20%2B%20Vanilla%20JS-F7DF1E?logo=javascript&logoColor=111827" alt="EJS and Vanilla JavaScript">
</p>

The Daily Web is a full-stack final project built by a team of five students.
It models a small digital newsroom where reporters create articles, editors
review and publish them, and readers consume the approved public content.

The project follows a simple MVC structure with server-rendered EJS pages,
REST endpoints, MongoDB/Mongoose, semantic HTML5, responsive CSS, and plain
JavaScript with AJAX. No frontend framework is required.

> **Team database:** normal development now uses the shared **MongoDB Atlas cloud
> database**. A local MongoDB database is still available as a **manual fallback**
> if the cloud connection is unavailable. See [Database setup and fallback](#database-setup-and-fallback).

## At a glance

| Area | What it does | Status |
| --- | --- | :---: |
| Authentication | Login, logout, roles, protected sessions | ✅ |
| Reporter workspace | Drafts, autosave, submission, editor feedback | ✅ |
| Editor control room | Search, review, edit, publish, request changes, delete | ✅ |
| Weather widget | Server-side weather request with a 15-minute cache | ✅ |
| Public home feed | Published articles, search, filters, sort, infinite scroll | ✅ |
| Article experience | Full article page, comments, view events, Impact Analytics | ✅ |

> **Current checkpoint:** all core areas are implemented, including the public
> article page, guest comments, view statistics, and the Impact Analytics graph.
> This is not a full submission sign-off: User CRUD and weather refresh on an
> open tab still need work. Check the [original requirements](docs/project-requirements.pdf)
> before submission.

## Editorial workflow

```text
Reporter creates draft
        │
        ▼
Autosave to MongoDB
        │
        ▼
Submit for editor review
        │
        ▼
   Editor decision
     ┌──┴──────────────┐
     │                 │
     ▼                 ▼
Request changes     Publish
     │                 │
     └──► Reporter     ▼
          updates   Approved public version
                         │
                         ▼
                    Readers view article
```

The system keeps the reporter's working version separate from the last
published version. This means readers continue to see approved content while
an updated article is being reviewed.

## Architecture

```text
┌────────────────────────────────────────┐
│ Browser: EJS + CSS + Vanilla JavaScript │
└──────────────────┬─────────────────────┘
                   ▼
             Express routes
                   │
                   ▼
              Controllers
              ┌────┴────┐
              ▼         ▼
          Services    Mongoose models
              │         │
              ▼         ▼
       Open-Meteo    MongoDB
       weather API
```

## Features

### Team authentication

- Login and logout with safe generic login errors.
- `reporter` and `editor` roles enforced on the server.
- Passwords stored as salted `scrypt` hashes.
- Persistent sessions stored in MongoDB as one-way token hashes.
- Protected HTTP-only cookies with a controlled lifetime.

### Reporter workspace

- View only the articles owned by the logged-in reporter.
- Create drafts and edit them through a focused workspace.
- Autosave changes while typing and when leaving the page.
- Submit complete drafts to the editor review queue.
- Read correction notes and submit a new revision.
- Edit a published article without changing the public version before approval.

### Editor control room

- Search the article queue by title.
- Filter articles by workflow status.
- Compare the public version with the working version.
- Save corrections without publishing automatically.
- Publish only after explicit editor approval.
- Return an article to the reporter with a required correction note.

### Public home feed

- Responsive newsroom interface with a dark, futuristic visual language.
- Only approved `publishedVersion` content reaches public article cards.
- Search, category, viewed status, and sorting update through AJAX.
- Infinite scroll loads twenty articles at a time with cursor pagination.
- Compound MongoDB indexes support date and popularity queries.
- Empty, loading, final-page, and retry states remain usable without a reload.
- Weather widget connected through a small server-side API response.

### Public article page, comments, and analytics

- Reporters can upload the main image from their computer: the picker is limited
  to JPG, PNG, WebP, and GIF, the server checks the real file signature and a 5MB
  limit, stores the file under a random name in `public/uploads/`, and the form
  keeps working with a typed address as well.
- Server-rendered article page: the full approved content is in the initial HTML.
- Guest comments are added through AJAX and appear immediately without a reload.
- The server blocks a fourth comment within one minute from the same browser key (429)
  and logs the blocked attempt as an operational event.
- Long threads load twenty comments at a time with cursor pagination and a
  load-more button; the first page and the real total are already in the HTML.
- Editors moderate comments on `/editor/comments`: text search across all
  articles (MongoDB text index), a visible/hidden filter, inline editing,
  soft deletion, and restore. Every action records the acting editor.
- Every article visit is counted on the server while the page renders, so it is
  recorded even without browser JavaScript; crawlers are filtered by user agent.
  The browser is identified by a first-party cookie that the page syncs into
  localStorage, so the feed's viewed/unviewed filter keeps matching.
- Views are stored three ways, each optimized for one question: a raw
  `ViewEvent` per visit (device-level questions, expires after 180 days), an
  hourly `ViewStat` bucket per article updated with an atomic `$inc` (charts
  read buckets instead of individual visits), and `viewCount` on the article
  (popularity sort). One visit performs three separate writes, not one transaction.
- Editors manage the statistics model on `/editor/views`: list and search
  published articles with total / 24h / 7d views, see the per-version
  breakdown, rebuild the buckets and counter from the raw events (Update), or
  reset an article's view data (Delete).
- Impact Analytics (Chart.js served locally from `node_modules`, without a CDN
  request for the chart library): views over a time axis with hourly detail for 24h / 7d and daily
  detail for 30d / all, gaps filled with zeros, a dashed labeled marker at every
  point an editor approved and published a version, and a table that states the
  views in the 24 hours before and after each update with the percentage change.

## Quick start

### Requirements

- Node.js 20 or newer
- Access to the team's MongoDB Atlas database and an internet connection
- Optional: MongoDB Community running locally for the fallback described below
- Git

### Install and run

```bash
git clone https://github.com/haimatiya-hase/The-Daily-Web.git
cd The-Daily-Web
npm install
test -f .env || cp .env.example .env
```

The last command creates `.env` only if it does not already exist. Do not
overwrite an existing `.env` when pulling changes from GitHub.

Before starting, set `MONGODB_URI` in your local `.env` to the team's private
Atlas connection string. Follow [Database setup and fallback](#database-setup-and-fallback),
then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), or the port set in your `.env`.
MongoDB is required for database-backed features. Without `MONGODB_URI`, the
HTTP service can answer health checks, but login, sessions, articles, and the
seed script cannot work normally. A running HTTP server alone does not prove
that the database connection succeeded.

## Environment variables

The `.env` file is local only and must never be committed. The connection string
below is a **placeholder**, not a working account. Replace it privately with the
team's connection details; never put real passwords in README files, screenshots,
or `.env.example`.

```text
PORT=3000
MONGODB_URI=mongodb+srv://DB_USER:URL_ENCODED_PASSWORD@CLUSTER_HOST/the-daily-web
SESSION_TTL_MINUTES=10080
WEATHER_API_URL=https://api.open-meteo.com/v1/forecast
WEATHER_LATITUDE=31.7683
WEATHER_LONGITUDE=35.2137
WEATHER_TIMEZONE=Asia/Jerusalem
SEED_PASSWORD=
```

`SEED_PASSWORD` is needed only when intentionally creating or resetting demo
accounts with the seed script. It is not needed to start an already prepared database.

## Database setup and fallback

### Normal team setup: MongoDB Atlas

1. Get the team's connection string through a private channel. Use the shared
   `the-daily-web` database, not a new cluster for each team member.
2. Make sure your current IP address is allowed in the Atlas project's IP access
   list. Use a **database user**, not your Atlas website login, to connect.
3. Put the connection string in your local `.env` as the only active
   `MONGODB_URI` line. Keep any options supplied in the team's working string.
4. Stop the running Node server with `Ctrl+C` in its terminal, then run
   `npm run dev` again. Restart explicitly after editing `.env`; do not rely on
   watch mode to reload that file.
5. Open [the health endpoint](http://localhost:3000/api/health) and check that
   `database` is `"connected"`. Adjust the port if your setup uses another one.

Atlas requires an allowed IP address and database-user credentials; see the
[official Atlas connection guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
If the connection fails, check internet access, the IP access list, credentials,
and the database name before changing code. Do not open access to every IP as a
routine workaround.

Everyone connected to the same cloud database sees the same saved data.
Edits, publications, deletions, and seed operations can affect the whole team.
Git branches separate **code**, not database records.

### Temporary fallback: local MongoDB

This is a manual switch to a separate database on your computer. The application
does **not** automatically switch to local MongoDB when Atlas fails.

1. Stop the Node server in its terminal with `Ctrl+C`.
2. Start your installed local MongoDB service. On a Mac with the project's
   MongoDB Community 8.0 Homebrew installation:

   ```bash
   brew services start mongodb-community@8.0
   ```

   If MongoDB is not installed, follow the
   [official macOS 8.0 installation guide](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-os-x/).
   Other operating systems need their own MongoDB installation and service commands.

3. In your private `.env`, comment out the cloud line and activate the local line:

   ```text
   # MONGODB_URI=mongodb+srv://DB_USER:URL_ENCODED_PASSWORD@CLUSTER_HOST/the-daily-web
   MONGODB_URI=mongodb://127.0.0.1:27017/the-daily-web
   ```

   Keep your real cloud connection string private so you can restore it later.
   Use **exactly one active `MONGODB_URI` line**. If you previously exported
   `MONGODB_URI` in the terminal, that value overrides `.env`; remove that override
   with `unset MONGODB_URI` when you want the server to use `.env`.

4. Run `npm run dev` and check `database: "connected"` at the health endpoint.
   Check your active connection setting too: the health endpoint does not identify
   whether the connected database is local or in the cloud.
5. Log in with an account that exists in the **local** database. If the local
   database is empty, follow [Demo data](#demo-data) to prepare it deliberately.
   An empty local database is not a failed connection.

**Important:** the local database is not an automatic backup or synchronized
copy of Atlas. Existing local data may be older, and new local changes will not
appear in the cloud. Moving data between them requires a separate, coordinated
backup/export and restore/import process. External photos and weather may still
need internet access while using the local database.

### Return to the cloud

Stop the Node server, comment out the local `MONGODB_URI`, restore your private
cloud connection line, and start the server again. Check the health endpoint and
log in again if needed: login sessions are stored in the selected database.
Returning to Atlas does not merge any changes made locally. Do not run seed just
to reconnect.

### Uploaded images are still local files

Atlas stores article data and image addresses, but uploaded image files still
live in `public/uploads/` on the computer running the application. Sharing the
database does not copy these files to teammates' computers. Keep the required
uploads available on the serving computer; external image URLs need to remain
accessible as well.

## Demo data

For a new **local fallback database**, first confirm that the active
`MONGODB_URI` points to `127.0.0.1`, and set a private `SEED_PASSWORD` in `.env`.
Then run:

```bash
npm run seed
npm start
```

The seed creates or updates:

- 4 team reporters and 1 team editor;
- 500 marked demo articles in all workflow states;
- published and working versions for update scenarios, including articles with
  two approved updates so the graph shows several publication markers;
- demo comments spread over two weeks, including long threads for
  pagination and hidden comments for the moderation screen;
- 30 days of view events with hourly spread for every published article, dense
  on the first twelve, with hourly buckets built by the rebuild action.

The fictional stories use category-specific public photos and the team's real
display names. New reporter drafts have no default image: choose or upload one.

**Shared cloud warning:** do not run `npm run seed` against the team's Atlas
database without explicit team coordination and a backup. The script writes to
whichever database `MONGODB_URI` selects; it is not restricted to local MongoDB.

**Seed reset warning:** rerunning seed replaces marked demo content and its
comments/views, including manual activity on those demo articles. It is not
needed to start the server. Back up data you want to keep before reseeding.

Team usernames:

```text
upr256
ddd99913
lirishavit
shakedbremer
haimatiya
```

Demo account passwords are set from `SEED_PASSWORD` when seed runs. For the
already prepared cloud database, use the credentials shared privately by the
team; do not rerun seed to set your own password. Do not use a demo password for
a real account.

## Useful commands

```bash
npm start       # Start the server
npm run dev     # Start the server with Node watch mode
npm test        # Run the automated tests
npm run seed    # Reset demo data in the selected database; coordinate before use
```

Health check:

```text
GET http://localhost:3000/api/health
```

The health endpoint returns the HTTP service and database connection status
without exposing credentials. Check `database`, not only `ok`.

Image upload (reporters and editors, raw image body, no external library):

```text
POST /api/uploads/images    Content-Type: image/png | image/jpeg | image/webp | image/gif
```

Impact Analytics endpoint (editor only):

```text
GET /api/analytics/:articleId?range=24h|7d|30d|all   series, markers, before/after impact
```

View statistics endpoints (editor only):

```text
GET    /api/views?search=&sort=&page=      list published articles with totals
GET    /api/views/:articleId               summary, recent activity, by version
POST   /api/views/:articleId/rebuild       recompute buckets and counter from events
DELETE /api/views/:articleId               delete all view data of the article
```

Comment endpoints:

```text
GET    /api/articles/:articleId/comments?cursor=   public, one page of a thread
POST   /api/articles/:articleId/comments           public, rate limited per device
GET    /api/comments?search=&status=&cursor=       editor, moderation queue
PATCH  /api/comments/:commentId                    editor, correct the text
DELETE /api/comments/:commentId                    editor, hide (soft delete)
POST   /api/comments/:commentId/restore            editor, make visible again
```

## Project structure

```text
src/
├── app.js                    Express app and middleware setup
├── server.js                 Database connection and HTTP server
├── config/                   Environment and MongoDB configuration
├── controllers/              Request handlers and response shaping
├── middleware/               Authentication and error handling
├── models/                   Mongoose schemas and database rules
├── routes/                   Browser and REST API routes
├── services/                 Workflow, session, weather, and analytics logic
├── utils/                    Logging, password, hashing, and HTTP errors
└── views/                    Server-rendered EJS pages and partials
public/
├── css/                      Responsive newsroom design
├── js/                       Vanilla JavaScript and AJAX behavior
└── uploads/                  Uploaded image files (keep this folder)
scripts/                      Demo data seed script
test/                         All automated tests, including reporter tests
docs/                         Branching guide and original project requirements
```

## Team ownership

Each student owns one product area from interface to database and tests.

| Team member | End-to-end responsibility |
| --- | --- |
| Liri | Login/Auth, Users, Security, Weather |
| Bremer | Home Feed, Search, Filter, Sort |
| Dor | Reporter Area |
| Haim | Editor Area and content management |
| Itay | Article, Comments, Views, Analytics, image upload |

## Git workflow

Our team workflow keeps `main` stable: develop on separate branches and review
Pull Requests before merging. This convention does not itself enforce GitHub
branch-protection settings.

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<name>-<scope>

# Make and test your changes
git add .
git commit -m "feat: describe the change"
git push -u origin feature/<name>-<scope>
```

Before merging, the Pull Request should include a short description, the
tests that were run, and a screenshot when the change affects the UI.

## Documentation

- [Database setup and fallback](#database-setup-and-fallback)
- [Branching strategy](docs/branching-strategy.md)
- [Team ownership](#team-ownership)
- [Original project requirements](docs/project-requirements.pdf)

## Code explanation rule

Code comments are written in simple English. Each function and non-obvious
operation has a short nearby explanation so every team member can explain the
implementation during the project defense.

## Academic project note

This repository was created for a course final project. The implementation is
kept intentionally clear and easy to explain: small modules, direct data
flows, server-side security checks, and no unnecessary framework complexity.
