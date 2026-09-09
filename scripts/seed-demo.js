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

// Keep only the five real team accounts in the local demo database.
const legacyDemoUsernames = ["reporter.one", "reporter.two", "reporter.three", "editor.one"];
const reporterAccounts = [
  { username: "upr256", displayName: "איתי" },
  { username: "ddd99913", displayName: "דור" },
  { username: "lirishavit", displayName: "לירי שביט" },
  { username: "shakedbremer", displayName: "שקד ברמר" }
];
const editorAccount = { username: "haimatiya", displayName: "חיים אטייה" };

// Use a small set of public photos and rotate them by category.
const imageSets = {
  "חדשות": [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=85"
  ],
  "כלכלה": [
    "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=85"
  ],
  "תרבות": [
    "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=1200&q=85"
  ],
  "ספורט": [
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=85"
  ],
  "טכנולוגיה": [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1484417894907-623942c8ee29?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=85"
  ]
};

// Give each category a few realistic stories for the demo feed.
const storyTemplates = {
  "חדשות": [
    {
      title: "תוכנית התחבורה החדשה מרחיבה את השירות בשעות העומס",
      summary: "הרשות המקומית מציגה מסלולים חדשים ומקצרת את זמני ההמתנה במרכזי התעסוקה.",
      content: "התוכנית החדשה כוללת תגבור של קווי האוטובוס בשעות הבוקר והערב, התאמת תחנות מרכזיות ושיפור המידע לנוסעים. ברשות אומרים כי הנתונים ייבדקו בחודשים הקרובים כדי למדוד את השפעת השינוי."
    },
    {
      title: "מרכזי השירות העירוניים עוברים למערכת תורים דיגיטלית",
      summary: "השירות החדש מאפשר לתושבים לבחור מועד מראש ולקבל עדכונים בזמן אמת.",
      content: "המערכת הדיגיטלית נפתחת בהדרגה במרכזי השירות ותאפשר הזמנת תור, שינוי מועד וקבלת הודעה לפני ההגעה. המהלך נועד לצמצם עומסים ולשפר את חוויית השירות לתושבים."
    },
    {
      title: "נפתח מסלול חדש להכשרת מתנדבים בקהילה",
      summary: "התוכנית תכשיר תושבים לסיוע לקשישים, למשפחות וליוזמות שכונתיות.",
      content: "המחזור הראשון של התוכנית יכלול מפגשי הכשרה, ליווי מקצועי וחיבור בין מתנדבים לעמותות מקומיות. המארגנים מצפים שהמודל יאפשר להרחיב את הפעילות לשכונות נוספות."
    }
  ],
  "כלכלה": [
    {
      title: "עסקים קטנים מקבלים מסלול חדש למימון דיגיטלי",
      summary: "המסלול נועד לקצר את תהליך הבדיקה ולתת לבעלי עסקים תמונת מצב ברורה.",
      content: "היוזמה החדשה מרכזת מידע על הכנסות, הוצאות ותזרים במקום אחד. בעלי עסקים יוכלו לקבל הערכה ראשונית ולבחון אפשרויות מימון לפני פגישה עם יועץ."
    },
    {
      title: "מדד אמון הצרכנים עולה בעקבות ירידה במחירי השירותים",
      summary: "נתוני הסקר מצביעים על שיפור מתון בתחושת הביטחון הכלכלי של משקי הבית.",
      content: "הסקר החודשי מצא כי יותר משפחות מרגישות בנוח לבצע רכישות מתוכננות. לצד זאת, המשתתפים עדיין מציינים את יוקר הדיור וההוצאות הקבועות כגורמים מרכזיים לחוסר ודאות."
    },
    {
      title: "חברות מקומיות משקיעות יותר בהכשרת עובדים",
      summary: "מנהלים מדווחים על מעבר מתוכניות חד־פעמיות להכשרה רציפה בתוך הארגון.",
      content: "ההשקעה בהכשרת עובדים מתמקדת בכלים דיגיטליים, ניהול צוותים ושיפור תהליכי עבודה. מומחים אומרים כי הכשרה רציפה מסייעת לארגונים לשמור על עובדים ולהתאים את עצמם לשינויים."
    }
  ],
  "תרבות": [
    {
      title: "פסטיבל הקיץ חוזר עם מופעי חוץ ויוצרים צעירים",
      summary: "האירוע יציע מוזיקה, קולנוע ואמנות במרחבים פתוחים ברחבי העיר.",
      content: "הפסטיבל יפגיש אמנים מוכרים עם יוצרים בתחילת דרכם ויכלול מופעים ללא עלות לצד אירועים בהרשמה מראש. צוות ההפקה מבטיח תוכנית מגוונת שמתאימה למשפחות ולקהל צעיר."
    },
    {
      title: "תערוכה חדשה בוחנת את הקשר בין זיכרון למקום",
      summary: "עבודות של שמונה אמנים מציגות סיפורים אישיים דרך צילום, וידאו וחפצים יומיומיים.",
      content: "התערוכה מציעה נקודות מבט שונות על האופן שבו מקומות מוכרים נשמרים בזיכרון. המבקרים יכולים לשמוע את סיפורי האמנים ולשלב בין חוויה חזותית לתוכן קולי."
    },
    {
      title: "ספרייה עירונית פותחת סדרת מפגשים על כתיבה עכשווית",
      summary: "הסדרה תכלול שיחות עם סופרים, עורכים ויוצרים מהקהילה המקומית.",
      content: "בכל מפגש יתמקדו המשתתפים בשלב אחר של תהליך הכתיבה, מבחירת רעיון ועד עריכה. המפגשים פתוחים לקהל וכוללים זמן לשאלות ולתרגול קצר."
    }
  ],
  "ספורט": [
    {
      title: "מועדון הנוער משיק תוכנית אימונים פתוחה לכל הקהילה",
      summary: "התוכנית תציע אימונים שבועיים במספר ענפים ותעודד השתתפות של בני נוער חדשים.",
      content: "הפעילות תתקיים בקבוצות לפי גיל ורמת ניסיון ותכלול אימוני כושר, משחקי צוות והדרכה אישית. המועדון יאפשר שיעור היכרות ללא עלות במהלך החודש הראשון."
    },
    {
      title: "הקבוצה המקומית משלימה הכנות לעונה החדשה",
      summary: "הצוות המקצועי שילב שחקנים צעירים בסגל ומתמקד בשיפור משחק ההגנה.",
      content: "במהלך משחקי ההכנה המאמן בחן הרכבים שונים ונתן דקות משחק לשחקנים שעלו מקבוצת הנוער. במועדון אומרים שהמטרה היא לבנות סגל מאוזן ולהתקדם בהדרגה."
    },
    {
      title: "מרוץ הלילה העירוני יתקיים במסלול חדש",
      summary: "המסלול יעבור ברחובות המרכזיים ויסתיים במתחם פעילות למשפחות.",
      content: "המארגנים שינו את המסלול כדי להרחיב את אזורי העידוד ולהפחית את ההשפעה על התנועה. האירוע יכלול מקצים למרחקים שונים ותחנות מים לאורך הדרך."
    }
  ],
  "טכנולוגיה": [
    {
      title: "כלי חדש מסייע לעסקים לאתר תקלות לפני שהן משפיעות על הלקוחות",
      summary: "המערכת מרכזת נתוני שימוש ומתריעה לצוותים על חריגות בזמן אמת.",
      content: "הכלי מנתח מדדים מרכזיים ומציג אותם בלוח בקרה פשוט. כאשר מזוהה שינוי חריג, הצוות מקבל התראה עם פרטי האירוע והצעה לבדיקה ראשונית."
    },
    {
      title: "מעבדת החדשנות מציגה פתרונות לחיסכון באנרגיה",
      summary: "הפרויקטים החדשים משלבים חיישנים, ניתוח נתונים ותכנון יעיל של מבנים.",
      content: "המעבדה הציגה כמה אבות־טיפוס שנועדו למדוד צריכת חשמל ולהציע פעולות פשוטות לצמצום בזבוז. החוקרים מתכננים לבחון את הפתרונות במבנים ציבוריים במהלך השנה."
    },
    {
      title: "קורס קוד פתוח מכשיר סטודנטים לעבודה על פרויקטים אמיתיים",
      summary: "המשתתפים לומדים לעבוד עם Git, ביקורת קוד ותכנון משימות בצוות.",
      content: "במסגרת הקורס הסטודנטים מפתחים מוצר קטן משלב הרעיון ועד פרסום גרסה עובדת. הדגש הוא על עבודה מסודרת, תיעוד ברור ושיתוף פעולה בין חברי הצוות."
    }
  ]
};

// Use familiar names so the demo looks like a real newsroom.
const commentNames = ["רוני לוי", "שירה כהן", "אורי מזרחי", "נועה אברהם", "יונתן פרץ"];

// Pick a story and an image in a stable way for every article number.
function getStoryData(category, index) {
  const categoryPosition = Math.floor((index - 1) / categories.length);
  const stories = storyTemplates[category];
  const images = imageSets[category];

  return {
    story: stories[categoryPosition % stories.length],
    imageUrl: images[categoryPosition % images.length]
  };
}

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

// Remove only the old placeholder accounts created by earlier seed versions.
async function removeLegacyDemoUsers() {
  await User.deleteMany({ username: { $in: legacyDemoUsernames } }).exec();
}

// Build one article version with clear content for the demo screen.
function buildSnapshot(index, category, versionNumber, publishedAt = null, approvedBy = null) {
  // Make later versions visibly different during a classroom demo.
  const updateText = versionNumber > 1 ? " (עדכון)" : "";
  const { story, imageUrl } = getStoryData(category, index);

  // Return one valid article version that fits the Mongoose schema.
  return {
    versionNumber,
    title: `${story.title}${updateText}`,
    summary: story.summary,
    content: story.content,
    imageUrl,
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
      ? versionNumber > 1
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - index * 60 * 1000) // Place updates one week back so the graph shows views before and after the update point.
        : new Date(Date.now() - index * 60 * 60 * 1000)
      : null;
    // Give updated articles an earlier first publication for the analytics markers.
    const firstPublishedAt = versionNumber > 1
      ? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 - index * 60 * 1000)
      : publishedAt;
    // Record every approval point so the Impact Analytics graph can mark it.
    const publicationHistory = hasPublishedVersion
      ? versionNumber > 1
        ? [
          { versionNumber: 1, publishedAt: firstPublishedAt, approvedBy: editor._id },
          { versionNumber: 2, publishedAt, approvedBy: editor._id }
        ]
        : [{ versionNumber: 1, publishedAt, approvedBy: editor._id }]
      : [];

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
            publicationHistory,
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
    guestName: commentNames[index % commentNames.length],
    body: "כתבה מעניינת. אשמח לראות עדכון נוסף בנושא.",
    clientKeyHash: hashClientKey(`demo-comment-${index + 1}`)
  }));
  await Comment.insertMany(commentDocuments);

  // Add a fourteen-day view timeline for published demo articles.
  const publishedArticles = articles
    .filter((article) => article.status === "published")
    .slice(0, 12);
  const viewEvents = [];

  for (const [articleIndex, article] of publishedArticles.entries()) {
    // Use the approved version when attaching views to each demo article.
    const finalVersion = Number(article.publishedVersion.versionNumber) || 1;

    for (let day = 0; day < 14; day += 1) {
      // Create one event day at a time for the analytics timeline.
      const viewedAt = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
      const publicationVersion = finalVersion > 1 && day >= 7 ? 1 : finalVersion;
      // Vary the daily totals and add a clear uplift after an approved update.
      const dailyViews = 2 + ((day + articleIndex) % 4) + (finalVersion > 1 && day < 7 ? 4 : 0);

      for (let count = 0; count < dailyViews; count += 1) {
        // Add several anonymous sample views for this article and day.
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

  // Keep each article popularity counter equal to its seeded view events.
  const viewTotals = new Map();
  for (const event of viewEvents) {
    // Count the events that belong to each demo article.
    const key = String(event.article);
    viewTotals.set(key, (viewTotals.get(key) || 0) + 1);
  }
  await Promise.all(
    // Update only the articles that received seeded events.
    [...viewTotals].map(([articleId, total]) => Article.updateOne({ _id: articleId }, { $set: { viewCount: total } }))
  );
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

  // Remove placeholder accounts before creating the real team accounts.
  await removeLegacyDemoUsers();

  // Create the four reporter accounts in parallel.
  const reporters = await Promise.all(
    reporterAccounts.map(({ username, displayName }) => (
      getOrCreateUser(username, displayName, "reporter")
    ))
  );
  // Create the editor account used by the review dashboard.
  const editor = await getOrCreateUser(editorAccount.username, editorAccount.displayName, "editor");
  // Seed articles first so comments and views have valid article references.
  const articles = await upsertDemoArticles(reporters, editor);

  // Rebuild the related comments and analytics timeline.
  await refreshDemoRelatedData(articles);

  console.log(`Seed complete. Users: 5, articles: ${articles.length}, comments: 20, view timeline: ready.`);
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
