# מעקב דרישות מול התשתית

המסמך מפריד בין דרישות הפרויקט המקוריות לבין מה שהוקם כרגע.

| דרישה | מיקום בתשתית | מצב |
| --- | --- | --- |
| Node.js + Express | `src/server.js`, `src/app.js` | הוכן |
| MVC | `src/controllers`, `src/models`, `src/views` | הוכן כשלד |
| MongoDB + Mongoose | `src/config/database.js`, `src/models` | הוכן כשלד |
| EJS ו-HTML5 סמנטי | `src/views` | הוכן כשלד |
| Vanilla JS + AJAX | `public/js/reporter.js` | מומש באזור הכתב; יתר האזורים בהמשך |
| ארבעה מודלים עיקריים | `src/models` | הוגדרו סכמות בסיס |
| לוגים וטיפול שגיאות | `src/utils/logger.js`, `src/middleware` | הוכן |
| סיסמאות לא גלויות | `src/utils/password.js` | הוכן מנגנון בסיסי |
| שמירת session אחרי Restart | `src/models/session.model.js` | מודל מוכן; חיבור auth בהמשך |
| פיד, חיפוש, סינון, מיון ו-infinite scroll | `src/controllers`, `src/routes`, `public/js` | בהמשך |
| גרסאות כתבה ו-workflow | `src/models/article.model.js`, `src/controllers/reporter.controller.js` | מומשו מעברי הסטטוס שבאחריות הכתב ושמירת גרסה ציבורית נפרדת |
| תגובות והגבלת 3 בדקה | `src/models/comment.model.js` | מודל בסיסי; middleware בהמשך |
| Impact Analytics | `src/models/view-event.model.js`, `src/services/analytics.service.js` | בסיס נתונים ושירות ראשוני |
| Weather widget | `src/services/weather.service.js` | שירות ראשוני; cache בהמשך |
| 500 כתבות ונתוני דמו | `scripts/seed-demo.js` | הוכן להרצה עם MongoDB |

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
