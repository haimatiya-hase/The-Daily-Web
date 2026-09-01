# The Daily Web

מערכת חדשות אינטרנטית במסגרת פרויקט הגמר. הפרויקט נבנה לפי דרישות הקורס
ובארכיטקטורת MVC, באמצעות Node.js, Express, MongoDB, Mongoose, EJS,
HTML5, CSS ו-Vanilla JavaScript.

## מצב הפרויקט

המאגר נמצא בשלב תשתית ראשוני. קיימים כבר מבנה MVC, תבניות בסיס, מודלים,
מסלול health, תיעוד עבודה ו-seed לנתוני הדגמה. הפיצ'רים העסקיים יתווספו
בהדרגה באמצעות branches ו-Pull Requests.

## דרישות מקומיות

- Node.js 20 ומעלה
- MongoDB מקומי או MongoDB Atlas
- Git וחשבון GitHub אישי לכל חברי הקבוצה

## התקנה והרצה

```bash
npm install
cp .env.example .env
npm run dev
```

המערכת תהיה זמינה בכתובת `http://localhost:3000`.

אם MongoDB אינו זמין, השרת עדיין יעלה במצב תשתית-ממשק, ומסלול
`/api/health` יציין שהחיבור למסד הנתונים אינו מוגדר. לצורך הפיצ'רים עצמם
יש להגדיר `MONGODB_URI` בקובץ `.env`.

## משתני סביבה

אין להעלות את `.env` ל-Git. יש להעתיק את `.env.example` ל-`.env` ולמלא
רק את הערכים המקומיים. אין לשמור במאגר סיסמאות, API keys או טוקנים.

## פקודות שימושיות

```bash
npm start       # הרצת השרת
npm run dev     # הרצה עם Node watch
npm run check   # בדיקת syntax לכל קבצי JavaScript
npm run seed    # יצירת נתוני דמו; דורש SEED_PASSWORD ב-.env
```

## מבנה הפרויקט

```text
src/
  app.js                 # בניית Express וה-middleware
  server.js              # חיבור למסד הנתונים והפעלת השרת
  config/                # סביבה וחיבור MongoDB
  controllers/           # שכבת Controller
  middleware/            # הרשאות וטיפול בשגיאות
  models/                # User, Article, Comment, ViewEvent, Session
  routes/                # מסלולי Web ו-REST API
  services/              # שירותי מזג אוויר ואנליטיקות
  utils/                 # לוגים, סיסמאות ושגיאות
  views/                 # תבניות EJS
public/
  css/                   # עיצוב רספונסיבי
  js/                    # Vanilla JavaScript/AJAX
scripts/                 # seed ובדיקות syntax
docs/                    # חלוקת עבודה, branching ומעקב דרישות
```

## כללי עבודה בצוות

1. לא עובדים ישירות על `main`.
2. כל משימה מקבלת branch בשם `feature/<name>-<scope>` או `fix/<name>-<scope>`.
3. פותחים Pull Request עם תיאור, צילום מסך ובדיקה שבוצעה.
4. משתמשים ב-commits קטנים וברורים, למשל `feat: add article status model`.
5. לפני התחלת עבודה: `git pull origin main`.
6. כל חברי הקבוצה צריכים להכיר את כלל הקוד, לא רק את האזור שבנו.

פירוט נוסף נמצא ב-`docs/branching-strategy.md` וב-`docs/team-division.md`.

## בדיקת health

```text
GET /api/health
```

המסלול מחזיר את מצב השרת ואת מצב החיבור למסד הנתונים, ללא מידע רגיש.
