# Simple English code walkthrough

This project is intentionally built with a small number of technologies:
Node.js, Express, Mongoose, EJS, HTML, CSS, and browser JavaScript.

## How to read the application

1. `src/server.js` starts the process and opens the HTTP port.
2. `src/app.js` creates the Express application and registers middleware.
3. `src/routes` maps URLs to controllers.
4. `src/controllers` decides which response should be returned.
5. `src/models` describes the MongoDB documents.
6. `src/services` contains reusable business operations.
7. `src/views` creates the first HTML response on the server.
8. `public/js` adds AJAX and browser interaction after the HTML arrives.

## Comment rule

Comments are written in simple English because the code should be easy to
explain during the defense. Every function and non-obvious operation has a
short nearby comment. A comment does not replace understanding: every team
member must still read, run, and explain the code.

## Main design decisions

- The public article page is rendered by EJS on the server for SEO.
- The public feed will use AJAX for search, filters, sorting, and pagination.
- `workingVersion` and `publishedVersion` keep unpublished edits away from readers.
- Passwords use Node's built-in `crypto.scrypt` and are never stored as plain text.
- Sessions have a MongoDB model so a server restart does not have to log users out.
- View events are stored separately so analytics can group views by day and version.
- The weather service keeps a successful result in memory for up to 15 minutes.
- The browser requests weather from our API, so the external service stays behind the server.
- Guests are visitors without a database user, while reporters and editors have stored roles.
- Role middleware checks permissions on the server before a protected page is rendered.
