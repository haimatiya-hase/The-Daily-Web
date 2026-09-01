# מעקב דרישות מול התשתית

המסמך מפריד בין דרישות הפרויקט המקוריות לבין מה שהוקם כרגע.

| דרישה | מיקום בתשתית | מצב |
| --- | --- | --- |
| Node.js + Express | `src/server.js`, `src/app.js` | הוכן |
| MVC | `src/controllers`, `src/models`, `src/views` | הוכן כשלד |
| MongoDB + Mongoose | `src/config/database.js`, `src/models` | הוכן כשלד |
| EJS ו-HTML5 סמנטי | `src/views` | הוכן כשלד |
| Vanilla JS + AJAX | `public/js/reporter.js`, `public/js/editor.js`, `public/js` | התחברות, מזג אוויר, אזור הכתב ואזור העורך הוכנו; פיד ותגובות בהמשך |
| ארבעה מודלים עיקריים | `src/models` | הוגדרו סכמות בסיס עם גרסאות כתבה |
| לוגים וטיפול שגיאות | `src/utils/logger.js`, `src/middleware` | הוכן |
| סיסמאות לא גלויות | `src/utils/password.js`, `test/auth-security.test.js` | הושלם ונבדק עם salt ו-scrypt |
| Login ו-Logout | `src/controllers/auth.controller.js`, `src/views/pages/login.ejs` | הושלם עם הודעת שגיאה בטוחה |
| Guest, Reporter ו-Editor | `src/models/user.model.js`, `src/middleware/auth.middleware.js` | הושלם ונבדק בצד השרת |
| שמירת session אחרי Restart | `src/models/session.model.js`, `src/services/session.service.js` | הושלם עם MongoDB ו-cookie מוגן |
| פיד, חיפוש, סינון, מיון ו-infinite scroll | `src/controllers`, `src/routes`, `public/js` | אזור העורך כולל חיפוש וסינון; הפיד בהמשך |
| גרסאות כתבה ו-workflow | `src/models/article.model.js`, `src/services/article-workflow.service.js`, `src/controllers/reporter.controller.js` | מעברי הכתב והעורך הוכנו עם גרסה ציבורית נפרדת |
| תגובות והגבלת 3 בדקה | `src/models/comment.model.js` | מודל בסיסי; middleware בהמשך |
| Impact Analytics | `src/models/view-event.model.js`, `src/services/analytics.service.js` | בסיס נתונים ושירות ראשוני |
| Weather widget | `src/services/weather.service.js`, `src/routes/api.routes.js`, `public/js/home.js` | הושלם עם cache של עד 15 דקות ומצב שגיאה בטוח |
| 500 כתבות ונתוני דמו | `scripts/seed-demo.js`, `docs/mongodb-setup.md` | seed חוזר ובטוח לנתוני דמו מסומנים |

## מיפוי דרישות — Reporter Area

| דרישת הכתב | מימוש | אימות |
| --- | --- | --- |
| הצגת הכתבות של הכתב בלבד והסטטוס שלהן | `showReporterDashboard`, שאילתה לפי `author`, `reporter.ejs` | בדיקת בעלות בבקר ובדיקת ממשק |
| יצירת כתבה חדשה במצב `draft` | `POST /api/reporter/articles` | בדיקת בקר: הבעלות נלקחת מהמשתמש המחובר |
| עריכת טיוטה ושמירה אוטומטית | `PUT` ו-`POST autosave`, `public/js/reporter.js` | בדיקת בקר ובדיקת ממשק בדפדפן |
| שליחה לאישור עורך | `POST /api/reporter/articles/:articleId/submit` | בדיקה של מעבר ל-`pending_review` |
| הצגת הערת עורך, תיקון והגשה מחדש | `editorNote`, סטטוס `changes_requested`, מסכי הכתב | בדיקת הרשאות המצבים ורינדור EJS |
| חסימת עריכה בזמן בדיקת עורך וחסימת פרסום בידי כתב | `canReporterEdit`, `requireRole("reporter")` והיעדר פעולת publish | בדיקות בקר והגנת שרת |
| עדכון כתבה שפורסמה בלי לשנות את הגרסה הציבורית לפני אישור | `workingVersion` נפרדת מ-`publishedVersion` | בדיקת יצירת גרסה פרטית חדשה |

## דרישות שצריך לאמת מול הצוות

1. שכל חמשת הסטודנטים רשומים לאותו מרצה — אושר על ידי הקבוצה.
2. אילו חבילות נוספות נלמדו ומותרות בקורס, במיוחד עבור session, העלאת
   תמונות וגרפים.
3. מסמך הדרישות מחייב MongoDB ו-Mongoose, אך אינו מחייב מקומי או Atlas.
   נקודת הפתיחה שנבחרה היא MongoDB מקומי.
4. חשבונות GitHub שנמסרו: `lirishavit`, `shakedbremer`, `upr256`,
   `Ddd99913`. חשבון המאגר הוא `haimatiya`.
5. `upr256` משויך לאיתי ו-`Ddd99913` משויך לדור.

## Audit of Liri and Dor work

### Liri - Login/Auth, Users, Security and Weather

- Login and logout are implemented with server-side role checks.
- Passwords use salted `scrypt` hashes and are hidden from normal user output.
- Sessions are stored in MongoDB as one-way token hashes, so they survive a server restart.
- The weather API is free, server-side, and cached for no more than fifteen minutes.
- A malformed session cookie is ignored safely instead of crashing the request.
- Expired weather data is not shown after an external service failure.

### Dor - Reporter Area

- Reporters can read and change only their own articles.
- The allowed workflow transitions are enforced by the server.
- Autosave and page-close saving keep the working version in MongoDB.
- Published content stays separate from a reporter's private update until editor approval.
- Required article fields and maximum lengths are checked before saving or submitting.
- Malformed autosave bodies are converted into safe input instead of causing a server exception.

### Still pending from other project areas

- The public feed, search, filters, sorting, and infinite scroll belong to Bremer.
- The public article page, comments, view events, and Impact Analytics belong to Itay.
- The current home page intentionally shows a styled feed preview until those branches are merged.
