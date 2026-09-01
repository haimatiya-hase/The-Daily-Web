// Load native helpers, configuration, models, and password hashing.
const config = require("../src/config/environment");
const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const User = require("../src/models/user.model");
const Article = require("../src/models/article.model");
const Comment = require("../src/models/comment.model");
const ViewEvent = require("../src/models/view-event.model");
const { hashPassword } = require("../src/utils/password");
const { hashClientKey } = require("../src/utils/client-key");

// Keep demo data predictable for the defense and local development.
const DEMO_ARTICLE_COUNT = 500;
const DEMO_KEY_PREFIX = "demo-article-";
const categories = ["חדשות", "כלכלה", "תרבות", "ספורט", "טכנולוגיה"];
const statuses = ["draft", "pending_review", "published", "changes_requested"];

// Create a user only once and update its demo password when needed.
async function getOrCreateUser(username, displayName, role) {
  // Hash the shared demo password before it reaches the user collection.
  const passwordHash = await hashPassword(config.seedPassword);

  // Update an existing demo user or insert it when it is missing.
  return User.findOneAndUpdate(
    { username },
    { username, displayName, role, passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
}

// Build one article version with clear content for the demo screen.
function buildSnapshot(index, category, versionNumber, publishedAt = null, approvedBy = null) {
  // Make later versions visibly different during a classroom demo.
  const updateText = versionNumber > 1 ? " - updated version" : "";

  // Return one valid article version that fits the Mongoose schema.
  return {
    versionNumber,
    title: `Demo article ${index}${updateText}: A sample news story`,
    summary: `Summary for demo article ${index}. It supports feed, search, and editor testing.`,
    content: `This is demo content for article ${index}. It gives the team a safe record for testing the full article workflow.`,
    imageUrl: "/images/demo-article.svg",
    category,
    createdAt: new Date(),
    publishedAt,
    approvedAt: publishedAt,
    approvedBy
  };
}

// Create or update exactly 500 records owned by this seed script.
async function upsertDemoArticles(reporters, editor) {
  // Collect bulk operations so 500 demo articles use one database write.
  const operations = [];

  for (let offset = 0; offset < DEMO_ARTICLE_COUNT; offset += 1) {
    // Build predictable status, category, and owner values for each record.
    const index = offset + 1;
    const status = statuses[offset % statuses.length];
    const category = categories[offset % categories.length];
    const author = reporters[offset % reporters.length];
    const hasPublishedVersion = status === "published";
    const versionNumber = hasPublishedVersion && index % 5 === 0 ? 2 : 1;
    const publishedAt = hasPublishedVersion
      ? new Date(Date.now() - index * 60 * 60 * 1000)
      : null;

    // Keep the working copy and public copy separate in the seed data.
    const workingVersion = buildSnapshot(index, category, versionNumber);
    const publishedVersion = hasPublishedVersion
      ? buildSnapshot(index, category, versionNumber, publishedAt, editor._id)
      : null;

    // Add an upsert so rerunning the seed updates only its own demo records.
    operations.push({
      updateOne: {
        filter: { demoKey: `${DEMO_KEY_PREFIX}${index}` },
        update: {
          $set: {
            demoKey: `${DEMO_KEY_PREFIX}${index}`,
            author: author._id,
            status,
            workingVersion,
            publishedVersion,
            editorNote: status === "changes_requested"
              ? "Please add a source and clarify the second paragraph."
              : "",
            revisionNumber: versionNumber,
            viewCount: hasPublishedVersion ? index * 7 : 0
          }
        },
        upsert: true
      }
    });
  }

  // Execute the prepared article updates in their original order.
  await Article.bulkWrite(operations, { ordered: true });

  // Select the records by their private seed key for related demo data.
  return Article.find({ demoKey: new RegExp(`^${DEMO_KEY_PREFIX}`) })
    .select("+demoKey")
    .sort({ demoKey: 1 })
    .exec();
}

// Rebuild only comments and views that belong to the demo articles.
async function refreshDemoRelatedData(articles) {
  // Keep related demo documents limited to the articles selected by this run.
  const articleIds = articles.map((article) => article._id);

  // Delete only records connected to the 500 marked demo articles.
  await Comment.deleteMany({ article: { $in: articleIds } }).exec();
  await ViewEvent.deleteMany({ article: { $in: articleIds } }).exec();

  // Add comments for the first 20 demo articles.
  const commentDocuments = articles.slice(0, 20).map((article, index) => ({
    article: article._id,
    guestName: `Demo reader ${index + 1}`,
    body: "This is a demo comment for the defense.",
    clientKeyHash: hashClientKey(`demo-comment-${index + 1}`)
  }));
  await Comment.insertMany(commentDocuments);

  // Add a fourteen-day view timeline for published demo articles.
  const publishedArticles = articles
    .filter((article) => article.status === "published")
    .slice(0, 12);
  const viewEvents = [];

  for (const article of publishedArticles) {
    // Use the approved version when attaching views to each demo article.
    const finalVersion = Number(article.publishedVersion.versionNumber) || 1;

    for (let day = 0; day < 14; day += 1) {
      // Create one event day at a time for the analytics timeline.
      const viewedAt = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
      const publicationVersion = finalVersion > 1 && day >= 7 ? 1 : finalVersion;

      for (let count = 0; count < 3; count += 1) {
        // Add three anonymous sample views for this article and day.
        // Use a stable hash so the seeded client identifier is not stored openly.
        const clientKey = `demo-view-${article._id}-${day}-${count}`;
        viewEvents.push({
          article: article._id,
          publicationVersion,
          viewedAt,
          dayKey: viewedAt.toISOString().slice(0, 10),
          clientKeyHash: hashClientKey(clientKey)
        });
      }
    }
  }

  await ViewEvent.insertMany(viewEvents);
}

// Seed users, articles, comments, and views for the whole team.
async function seed() {
  // Stop early when the required local database settings are missing.
  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is required to seed demo data.");
  }

  if (!config.seedPassword) {
    throw new Error("SEED_PASSWORD is required to seed demo users.");
  }

  // Open MongoDB before creating users and content.
  const connected = await connectDatabase();
  if (!connected) {
    throw new Error("MongoDB connection failed. Check MONGODB_URI and try again.");
  }

  // Create the three reporter accounts in parallel.
  const reporters = await Promise.all([
    getOrCreateUser("reporter.one", "Demo reporter 1", "reporter"),
    getOrCreateUser("reporter.two", "Demo reporter 2", "reporter"),
    getOrCreateUser("reporter.three", "Demo reporter 3", "reporter")
  ]);
  // Create the single editor account used by the review dashboard.
  const editor = await getOrCreateUser("editor.one", "Demo editor", "editor");
  // Seed articles first so comments and views have valid article references.
  const articles = await upsertDemoArticles(reporters, editor);

  // Rebuild the related comments and analytics timeline.
  await refreshDemoRelatedData(articles);

  console.log(`Seed complete. Users: 4, articles: ${articles.length}, comments: 20, view timeline: ready.`);
}

seed()
  .catch((error) => {
    // Print only the error message and return a failed process status.
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Close MongoDB whether seeding succeeded or failed.
    await disconnectDatabase();
  });
