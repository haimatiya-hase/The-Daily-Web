# Requirements traceability

Source: [original project requirements](project-requirements.pdf).
This describes the current code. A working feature does not prove every
submission requirement or edge case is complete.

## Implemented areas

| Requirement | Current implementation | Evidence to inspect |
| --- | --- | --- |
| Node.js, Express, MVC | Server, routes, controllers, models, EJS views, services | `src/server.js`, `src/app.js`, `src/` |
| MongoDB and Mongoose | Six schemas; local MongoDB is the selected setup | Models and database configuration |
| HTML5, EJS, responsive CSS | Server pages, shared partials, mobile media rules | `src/views/`, `public/css/main.css` |
| Vanilla JS and AJAX | Feed, reporter, editor, comments, statistics, graph | `public/js/` |
| Login/logout and roles | Server permission guards; persistent MongoDB sessions | Auth controller, middleware, session service, auth tests |
| Password protection | Salted scrypt passwords and hashed session tokens | Password/session helpers and security tests |
| Reporter workflow | Own articles, empty draft, autosave, submit, feedback, private update | Reporter controller/script and tests |
| Editor workflow | Search/filter/page, edit pending work, approve, return, delete | Editor controller, workflow service and tests |
| Public feed | Approved versions; 20-card cursor pages; search/filter/sort | Home controller/script and feed tests |
| Public article | Full approved content and first comments in initial HTML | Article controller/template and tests |
| Comments | AJAX, pagination, 3-per-minute browser-key limit, moderation | Comment service/controllers/scripts and tests |
| View statistics | Entry recording; events, hourly buckets, total; list/rebuild/reset | View service/controller/script and tests |
| Impact Analytics | Local Chart.js; time series, markers, before/after figures | Analytics service/script and tests |
| Image upload | Role/signature checks, 5MB limit, random filename | Upload service/routes and tests |
| Errors and logs | Common HTTP errors and structured process output | Error middleware and logger |
| Demo dataset | 5 team users, 500 marked articles, comments, 30-day views | Seed script; read the reset warning in MongoDB setup |
| Git and docs | Ownership, branches/PR workflow, setup and walkthrough | README/docs; confirm actual Git history before submission |

## Open requirements - do not mark complete

1. **User CRUD:** the User schema, authentication, and seeded accounts exist,
   but a complete user-management create/read/update/delete API or screen does
   not. CRUD for all main models still needs this decision and implementation.
2. **Weather on an open page:** server cache defaults to 15 minutes, but
   `home.js` does not periodically fetch weather. Expiry on the next request
   is not a maximum display-age guarantee for a tab left open.
3. **Submission evidence:** verify hand-in requirements, team participation,
   personal Git history, demonstration, and allowed dependencies against the
   original document. Unit tests alone do not establish these.
4. **Browser and concurrency checks:** perform the final desktop/mobile demo,
   session restart and incognito checks, approval, comment limits, upload,
   filters, and analytics. Do not claim a measured thousands-of-readers load
   test without performing one.

## Limits to explain honestly

- Anonymous keys are **hashed**, not encrypted. They identify browser storage,
  not a reliably unique physical person or device.
- Comment count-then-insert is not atomic under simultaneous requests; replacing
  a browser key also bypasses that identity's limit.
- The three view writes are not one transaction. Rebuild uses retained events
  only; raw events expire after 180 days.
- Cursor tie breakers do not create an immutable live-feed snapshot.
- Autosave can fail during network loss; page-exit saving is best effort.
- Article deletion does not cascade to related data or uploaded files.
- Logs go to process output, not a configured persistent log file.
- Seed reruns overwrite marked demo records and related comments/views,
  including manual activity on those records. Do not seed to start the server.

## Verification

```bash
npm run check
npm test
```

All tests are in `test/`. Use the
[application walkthrough](application-walkthrough.md) for the current code map.
