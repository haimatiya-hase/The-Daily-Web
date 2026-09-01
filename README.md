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

## At a glance

| Area | What it does | Status |
| --- | --- | :---: |
| Authentication | Login, logout, roles, protected sessions | ✅ |
| Reporter workspace | Drafts, autosave, submission, editor feedback | ✅ |
| Editor control room | Search, review, edit, publish, request changes, delete | ✅ |
| Weather widget | Server-side weather request with a 15-minute cache | ✅ |
| Public home feed | Published articles, search, filters, sort, infinite scroll | 🚧 |
| Article experience | Full article page, comments, view events, Impact Analytics | 🚧 |

> **Current checkpoint:** the shared authentication, Reporter, Editor, and
> weather foundations are integrated. The public feed and article analytics
> areas are being completed in the remaining team branches.

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

### Public experience foundation

- Responsive newsroom interface with a dark, futuristic visual language.
- Weather widget connected through a small server-side API response.
- Article and comment models prepared for the public reading experience.
- View-event model and analytics service prepared for Impact Analytics.

## Quick start

### Requirements

- Node.js 20 or newer
- MongoDB running locally, or a MongoDB Atlas connection
- Git

### Install and run

```bash
git clone https://github.com/haimatiya-hase/The-Daily-Web.git
cd The-Daily-Web
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

MongoDB is required for the database-backed features. If `MONGODB_URI` is
missing, the server can still render the UI scaffold, but login, sessions,
articles, and the seed script cannot work correctly.

## Environment variables

The `.env` file is local only and must never be committed.

```text
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/the-daily-web
SESSION_TTL_MINUTES=10080
WEATHER_API_URL=https://api.open-meteo.com/v1/forecast
WEATHER_LATITUDE=31.7683
WEATHER_LONGITUDE=35.2137
WEATHER_TIMEZONE=Asia/Jerusalem
SEED_PASSWORD=choose-a-private-demo-password
```

For the complete MongoDB setup, see
[`docs/mongodb-setup.md`](docs/mongodb-setup.md).

## Demo data

After MongoDB is available and `SEED_PASSWORD` is set in `.env`:

```bash
npm run seed
npm start
```

The seed creates or updates:

- 3 demo reporters and 1 demo editor;
- 500 marked demo articles in all workflow states;
- published and working versions for update scenarios;
- 20 demo comments;
- 14 days of view events for analytics testing.

Demo usernames:

```text
reporter.one
reporter.two
reporter.three
editor.one
```

All demo accounts use the local `SEED_PASSWORD` value. Do not use this demo
password for a real account.

## Useful commands

```bash
npm start       # Start the server
npm run dev     # Start the server with Node watch mode
npm run check   # Check the syntax of all JavaScript files
npm test        # Run the automated tests
npm run seed    # Create the local demo dataset
```

Health check:

```text
GET http://localhost:3000/api/health
```

The endpoint returns the server status and the database connection status
without exposing credentials.

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
└── js/                       Vanilla JavaScript and AJAX behavior
scripts/                      Seed and syntax-check utilities
test/                         Shared unit tests
tests/                        Reporter controller tests
docs/                         Requirements, walkthroughs, and team process
```

## Team ownership

Each student owns one product area from interface to database and tests.

| Team member | End-to-end responsibility | Main branch |
| --- | --- | --- |
| Liri | Login/Auth, Users, Security, Weather | `feature/liri-auth-weather` |
| Bremer | Home Feed, Search, Filter, Sort | `feature/bremer-home-feed` |
| Dor | Reporter Area | `feature/dor-reporter` |
| Haim | Editor Area and content management | `feature/haim-editor` |
| Itay | Article, Comments, Views, Analytics | `feature/itay-article-analytics` |

## Git workflow

We protect `main`. Every feature is developed on a separate branch and enters
`main` through a Pull Request.

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

- [Requirements traceability](docs/requirements-traceability.md)
- [MongoDB setup](docs/mongodb-setup.md)
- [Branching strategy](docs/branching-strategy.md)
- [Team division](docs/team-division.md)
- [Editor area walkthrough](docs/editor-area-walkthrough.md)
- [Authentication and weather walkthrough](docs/liri-auth-weather-walkthrough.md)
- [Code walkthrough](docs/code-walkthrough.md)
- [Original project requirements](docs/project-requirements.pdf)
- [Updated project division](docs/project-division-updated.docx)

## Code explanation rule

Code comments are written in simple English. Each function and non-obvious
operation has a short nearby explanation so every team member can explain the
implementation during the project defense.

## Academic project note

This repository was created for a course final project. The implementation is
kept intentionally clear and easy to explain: small modules, direct data
flows, server-side security checks, and no unnecessary framework complexity.
