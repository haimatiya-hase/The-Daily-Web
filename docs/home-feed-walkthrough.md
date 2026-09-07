# Bremer Home Feed Walkthrough

This document explains the public home feed in simple terms for development,
code review, and the project defense.

## Responsibility

The Home Feed area owns the public list of articles. It includes:

- approved public content only;
- loading twenty articles at a time;
- search by approved title and summary;
- category and viewed/unviewed filters;
- date and popularity sorting;
- AJAX updates without a full page reload;
- efficient MongoDB queries for thousands of articles.

## Request flow

1. `home.ejs` renders the page structure and feed controls.
2. `public/js/home.js` requests `GET /api/articles`.
3. `api.routes.js` sends the request to `getPublicFeed`.
4. `home.controller.js` validates the query values and builds the MongoDB filter.
5. The controller returns only fields from `publishedVersion` plus safe card metadata.
6. Browser JavaScript builds cards with DOM methods and never inserts article values as HTML.

## Feed API

`GET /api/articles` accepts these optional query parameters:

| Parameter | Values | Purpose |
| --- | --- | --- |
| `search` | text up to 100 characters | Search approved title and summary |
| `category` | one of the five project categories | Show one category |
| `viewStatus` | `viewed` or `unviewed` | Filter for one anonymous browser |
| `sort` | `publishedAt` or `popularity` | Choose the article order |
| `cursor` | opaque value returned by the previous response | Continue infinite scroll |

The browser also sends `X-Client-Key`, a random anonymous identifier. MongoDB
receives only its SHA-256 hash. This key is not authentication and contains no
personal information.

The response includes up to twenty articles and:

```json
{
  "pagination": {
    "pageSize": 20,
    "hasMore": true,
    "nextCursor": "opaque-value"
  }
}
```

## Why cursor pagination is used

Offset pagination asks MongoDB to scan and skip every earlier row. A deep page
therefore becomes slower as the article collection grows. The feed cursor
stores the last publication date, view count when needed, and article ID. The
next query starts after those values, so its cost does not grow with the page
number.

The article ID is the final tie breaker. It prevents duplicates or missing
articles when two records have the same date or number of views.

## MongoDB indexes

The Article schema defines compound indexes for:

- publication status, date, and ID;
- publication status, category, date, and ID;
- publication status, view count, date, and ID;
- publication status, category, view count, date, and ID;
- approved title and summary text search.

ViewEvent has a compound `clientKeyHash + article` index for the
viewed/unviewed lookup.

## Integration with the article area

Itay owns the public article page and the action that records a `ViewEvent`.
That action must receive the same browser value stored under
`dailyWebClientKey` and pass it to `recordArticleView`. Once those events are
recorded, the Home Feed viewed/unviewed filter uses them automatically.

## Browser behavior

- Search waits briefly while the visitor types.
- Category, view status, and sort changes run immediately.
- Every control change clears the old cursor and starts from the first result.
- Older AJAX responses are ignored after a newer search begins.
- Empty, loading, final-page, and error states are announced accessibly.
- A failed request can be retried without losing the current filters or cursor.
- The clear action restores all controls to their initial values.

## Verification

Run:

```bash
npm run check
npm test
```

The focused feed tests verify the public data boundary, cursor ranges, search,
both view filters, both sort modes, malformed cursor handling, and index
definitions. Browser checks cover AJAX combinations, retry, clearing controls,
and infinite scroll. CSS media rules move the toolbar and cards to one column
on small screens.

## Short defense explanation

The page is rendered with EJS, but the article list is loaded with AJAX. The
server always filters for published articles and returns only the approved
version. Search and filters become one MongoDB query. Infinite scroll uses a
cursor instead of `skip`, and compound indexes match the supported sort and
filter combinations. The browser safely creates cards, ignores stale requests,
and lets the visitor recover from a temporary error without reloading.
