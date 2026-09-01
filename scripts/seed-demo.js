// Load native helpers, configuration, models, and password hashing.
const { randomUUID } = require("node:crypto");
const config = require("../src/config/environment");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const User = require("../src/models/user.model");
const Article = require("../src/models/article.model");
const Comment = require("../src/models/comment.model");
const ViewEvent = require("../src/models/view-event.model");
const { hashPassword } = require("../src/utils/password");

const categories = ["חדשות", "כלכלה", "תרבות", "ספורט", "טכנולוגיה"];
const statuses = ["draft", "pending_review", "published", "changes_requested"];

// Create a user only once and update its demo password when needed.
async function getOrCreateUser(username, displayName, role) {
  const passwordHash = await hashPassword(config.seedPassword);
  return User.findOneAndUpdate(
    { username },
    { username, displayName, role, passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Build one article version with predictable demo content.
function buildSnapshot(index, category, versionNumber = 1, publishedAt = null) {
  return {
    versionNumber,
    title: `כותרת דמו ${index}: סיפור חדשותי לדוגמה`,
    summary: `תקציר כתבה ${index} לצורך הדגמת הפיד, החיפוש והסינון.`,
    content: `זהו תוכן דמו של כתבה ${index}. התוכן מאפשר להציג את דרישות המערכת ולהדגים את מבנה הכתבה.`,
    imageUrl: "/images/demo-article.svg",
    category,
    createdAt: new Date(),
    publishedAt
  };
}

// Create demo users, articles, comments, and view events.
async function seed() {
  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is required to seed demo data.");
  }
  if (!config.seedPassword) {
    throw new Error("SEED_PASSWORD is required to seed demo users.");
  }

  await connectDatabase();
  const reporters = await Promise.all([
    getOrCreateUser("reporter.one", "כתב דמו 1", "reporter"),
    getOrCreateUser("reporter.two", "כתב דמו 2", "reporter"),
    getOrCreateUser("reporter.three", "כתב דמו 3", "reporter")
  ]);
  const editor = await getOrCreateUser("editor.one", "עורך דמו", "editor");

  // Avoid creating more than the required 500 articles.
  const existingCount = await Article.countDocuments();
  const articlesToCreate = Math.max(0, 500 - existingCount);
  const articleIds = [];

  // Spread articles across all workflow states.
  for (let index = 0; index < articlesToCreate; index += 1) {
    const status = statuses[index % statuses.length];
    const author = reporters[index % reporters.length];
    const publishedAt = status === "published" ? new Date(Date.now() - index * 3600000) : null;
    const publishedVersion = status === "published" ? buildSnapshot(index + 1, categories[index % categories.length], 1, publishedAt) : null;

    const article = await Article.create({
      author: author._id,
      status,
      workingVersion: buildSnapshot(index + 1, categories[index % categories.length]),
      publishedVersion,
      editorNote: status === "changes_requested" ? "נא להוסיף מקור ולחדד את הפסקה השנייה." : undefined,
      revisionNumber: 1,
      viewCount: status === "published" ? (index + 1) * 7 : 0
    });
    articleIds.push(article._id);
  }

  // Add enough related data for the defense scenarios.
  if (articleIds.length > 0) {
    await Comment.insertMany(articleIds.slice(0, 20).map((articleId, index) => ({
      article: articleId,
      guestName: `קורא דמו ${index + 1}`,
      body: "תגובה לדוגמה לצורך ההדגמה.",
      clientKeyHash: randomUUID()
    })));

    const publishedIds = articleIds.slice(0, 12);
    const viewEvents = [];
    for (const articleId of publishedIds) {
      for (let day = 0; day < 14; day += 1) {
        const viewedAt = new Date(Date.now() - day * 86400000);
        for (let count = 0; count < 3; count += 1) {
          viewEvents.push({
            article: articleId,
            publicationVersion: 1,
            viewedAt,
            dayKey: viewedAt.toISOString().slice(0, 10)
          });
        }
      }
    }
    await ViewEvent.insertMany(viewEvents);
  }

  console.log(`Seed complete. Existing: ${existingCount}, created: ${articlesToCreate}, editor: ${editor.username}`);
}

seed()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
