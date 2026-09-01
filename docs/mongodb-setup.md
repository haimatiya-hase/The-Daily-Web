# Shared MongoDB Setup

MongoDB is a shared project service. The code supports a local MongoDB server
and MongoDB Atlas. The project requirements require MongoDB and Mongoose, but
they do not require one specific hosting option.

## Recommended team setup

For five students, use one MongoDB Atlas database for shared integration. Each
student keeps the same connection string in a local `.env` file. The `.env`
file is ignored by Git and must never be committed.

The local file starts from `.env.example`:

```bash
cp .env.example .env
```

Set these values locally:

```text
MONGODB_URI=your-private-mongodb-connection-string
SEED_PASSWORD=one-private-demo-password
```

The `MONGODB_URI` value must not be sent in a commit, Pull Request, screenshot,
or chat message. Each teammate should receive it through a private channel.

## Seed the shared demo database

Run the following from the project folder:

```bash
npm install
npm run seed
npm start
```

The seed creates or updates:

- four demo users: three reporters and one editor;
- 500 marked demo articles in all four workflow states;
- demo articles with published version numbers for update scenarios;
- 20 demo comments;
- fourteen days of view events for published articles.

The script is safe to run again for the marked demo records. It refreshes only
comments and views connected to those demo articles. It does not delete normal
team articles or normal team comments.

## Demo accounts

The usernames are `reporter.one`, `reporter.two`, `reporter.three`, and
`editor.one`. All demo passwords use the local `SEED_PASSWORD` value.

The authentication feature must be connected before these accounts can log in.
Do not use the demo password for a real account.

## Health check

After starting the server, open:

```text
http://localhost:3000/api/health
```

The response should show `"database":"connected"`. If it shows
`"not-configured"`, check that `.env` exists and contains `MONGODB_URI`.
