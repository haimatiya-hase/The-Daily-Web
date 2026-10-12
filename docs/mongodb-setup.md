# Local MongoDB setup

MongoDB with Mongoose is required. A hosted Atlas account is not required
for the local setup used on Haim's Mac.

## Three different things

- MongoDB is the database service running on the computer.
- Mongoose is the Node.js library our server uses to access the database.
- MongoDB Compass is an optional desktop viewer, not the database itself.

Git distributes code, not database files. Teammates using local MongoDB each
have a separate database and can prepare it with the same seed script.

## Start the installed service on Haim's Mac

```bash
brew services start mongodb-community@8.0
```

This starts the already installed service; do not install it again.
It normally listens at `127.0.0.1:27017`.

## Local configuration

Copy `.env.example` to `.env` for a first setup only. If `.env` exists, keep it:
copying again can overwrite local settings and secrets.

```text
MONGODB_URI=mongodb://127.0.0.1:27017/the-daily-web
SEED_PASSWORD=choose-a-private-demo-password
```

`.env` is ignored by Git. Never commit it or passwords/connection credentials.
`src/config/environment.js` loads it without dotenv.

## Prepare demonstration data - only when needed

```bash
npm install
npm run seed
```

The seed creates or refreshes:

- Four team reporters and one team editor with the team's real display names.
- 500 marked fictional articles in the categories and workflow states.
- Approved and working versions and multi-update publication histories.
- Comment threads, including long threads and hidden moderation examples.
- 30 days of view events and hourly statistics built from them.

**Reset warning:** seed is not read-only. It replaces marked article content
and deletes/recreates comments and views on those articles, including comments
you added manually. It also updates team accounts and removes named legacy
placeholder accounts. Articles outside the marked demo set are not selected
for that reset. Back up data you want to keep before reseeding.
Do not run seed every time you open the website or during ordinary code cleanup.

Usernames: `upr256`, `ddd99913`, `lirishavit`, `shakedbremer`, and `haimatiya`.
They use the local `SEED_PASSWORD` after seeding. This classroom password
must not be reused for other services.

## Start the website and check the database

From the folder containing `package.json`:

```bash
npm run dev
```

Open `http://localhost:3000/api/health` unless `PORT` was changed in `.env`.
Look for `"database":"connected"`. `"ok":true` alone means the HTTP service
answered; it does not prove the database works. Login and other database-backed
features need an available connection.

## View records

In Compass, connect to `mongodb://127.0.0.1:27017` and open `the-daily-web`.
Collections include users, sessions, articles, comments, viewevents, and
viewstats. A MongoDB URI belongs in Compass/Mongoose, not Safari's address bar.

Read-only shell example:

```bash
mongosh "mongodb://127.0.0.1:27017/the-daily-web"
```

Inside mongosh:

```javascript
show collections
db.articles.countDocuments()
db.articles.findOne({}, { "workingVersion.title": 1, status: 1 })
```

## Data location on this Mac

The Homebrew configuration is `/opt/homebrew/etc/mongod.conf`; its configured
data directory is `/opt/homebrew/var/mongodb`, outside the application folder.
Do not edit MongoDB's internal files manually. Use Compass or mongosh and back
up the database before destructive changes.

Uploaded images are different: their files live in `public/uploads/` and
Article records store the public URL.
