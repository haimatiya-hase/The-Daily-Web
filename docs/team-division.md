# Team ownership

Each member owns an application area end to end: screen, browser behavior,
server routes/controllers, data rules, tests, and explanation. This is an
ownership map, not a claim that every requirement is already complete.

| Member | GitHub | Area |
| --- | --- | --- |
| Haim Atiya | `haimatiya-hase` | Editor control room and content management |
| Dor | `Ddd99913` | Reporter workspace and draft workflow |
| Liri | `lirishavit` | Login, logout, users, permissions, sessions, weather |
| Bremer | `shakedbremer` | Public feed, search, filters, sort, infinite scroll |
| Itay | `upr256` | Public article, comments, views, Impact Analytics, image upload |

The application login for Haim is `haimatiya`; it is different from the GitHub
account name. See the original division document for the agreed assignment.

## Area boundaries

- Reporter: own articles, new draft, autosave, submission, returned feedback,
  and private updates to published articles.
- Editor: all-article queue, pending corrections, approval/publication,
  return with a note, article deletion, and comparison of both versions.
- Authentication/weather: team accounts and roles, password/token hashing,
  persistent sessions, protected routes, external weather and server cache.
- Feed: approved content only, twenty-card pages, search, category and viewed
  filters, date/popularity sorting, and AJAX UI states.
- Article/data: full content in initial HTML, guest comments/rate limit,
  moderation, entry recording, statistics, graphs, and image upload.

## Shared responsibilities

MVC, REST, MongoDB/Mongoose, responsive design, error handling, logs,
integration tests, demonstration data, and Git history are team responsibilities.
Each member must understand the full system, not only their own area.

For current gaps (especially User CRUD and weather refresh), use
[requirements traceability](requirements-traceability.md). For each area's
actual functions, use the [application walkthrough](application-walkthrough.md).
Branch and review conventions are in [Git workflow](branching-strategy.md).
The [original updated division](project-division-updated.docx) is preserved.
