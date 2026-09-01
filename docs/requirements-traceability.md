# מעקב דרישות מול התשתית

המסמך מפריד בין דרישות הפרויקט המקוריות לבין מה שהוקם כרגע.

| דרישה | מיקום בתשתית | מצב |
| --- | --- | --- |
| Node.js + Express | `src/server.js`, `src/app.js` | הוכן |
| MVC | `src/controllers`, `src/models`, `src/views` | הוכן כשלד |
| MongoDB + Mongoose | `src/config/database.js`, `src/models` | הוכן כשלד |
| EJS ו-HTML5 סמנטי | `src/views` | הוכן כשלד |
| Vanilla JS + AJAX | `public/js/editor.js`, `public/js` | אזור העורך הוכן; פיד ותגובות בהמשך |
| ארבעה מודלים עיקריים | `src/models` | הוגדרו סכמות בסיס עם גרסאות כתבה |
| לוגים וטיפול שגיאות | `src/utils/logger.js`, `src/middleware` | הוכן |
| סיסמאות לא גלויות | `src/utils/password.js` | הוכן מנגנון בסיסי |
| שמירת session אחרי Restart | `src/models/session.model.js` | מודל מוכן; חיבור auth בהמשך |
| פיד, חיפוש, סינון, מיון ו-infinite scroll | `src/controllers`, `src/routes`, `public/js` | אזור העורך כולל חיפוש וסינון; הפיד בהמשך |
| גרסאות כתבה ו-workflow | `src/models/article.model.js`, `src/services/article-workflow.service.js` | אזור העורך הוכן; מעברי כתב בהמשך |
| תגובות והגבלת 3 בדקה | `src/models/comment.model.js` | מודל בסיסי; middleware בהמשך |
| Impact Analytics | `src/models/view-event.model.js`, `src/services/analytics.service.js` | בסיס נתונים ושירות ראשוני |
| Weather widget | `src/services/weather.service.js` | שירות ראשוני; cache בהמשך |
| 500 כתבות ונתוני דמו | `scripts/seed-demo.js`, `docs/mongodb-setup.md` | seed חוזר ובטוח לנתוני דמו מסומנים |

## דרישות שצריך לאמת מול הצוות

1. שכל חמשת הסטודנטים רשומים לאותו מרצה — אושר על ידי הקבוצה.
2. אילו חבילות נוספות נלמדו ומותרות בקורס, במיוחד עבור session, העלאת
   תמונות וגרפים.
3. מסמך הדרישות מחייב MongoDB ו-Mongoose, אך אינו מחייב מקומי או Atlas.
   נקודת הפתיחה שנבחרה היא MongoDB מקומי.
4. חשבונות GitHub שנמסרו: `lirishavit`, `shakedbremer`, `upr256`,
   `Ddd99913`. חשבון המאגר הוא `haimatiya`.
5. `upr256` משויך לאיתי ו-`Ddd99913` משויך לדור.
