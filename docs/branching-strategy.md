# אסטרטגיית Git לצוות

הכללים האלו נועדו לעמוד בדרישות ניהול הגרסאות ולהשאיר היסטוריה שאפשר
להציג בהגנה.

## Branches

- `main` הוא branch יציב בלבד. לא דוחפים אליו ישירות.
- כל משימה מתחילה מ-`main` מעודכן.
- פיצ'ר: `feature/<member>-<short-scope>`
- תיקון: `fix/<member>-<short-scope>`
- הכנה להדגמה: `chore/<member>-demo-prep`

## Pull Request

כל PR יכלול:

1. מה השתנה ולמה.
2. אילו דרישות במסמך הוא מכסה.
3. איך בדקנו את השינוי.
4. צילום מסך אם יש שינוי בממשק.
5. אישור של חבר צוות נוסף לפני merge.

## Commits

מומלץ להשתמש בפורמט קצר ואחיד:

```text
feat: add article status model
fix: prevent duplicate guest comments
docs: update local setup instructions
chore: add demo seed script
```

לא משתמשים ב-commit כללי כמו `final` או `changes`.

## עבודה יומית

```bash
git switch main
git pull origin main
git switch -c feature/<member>-<scope>
# עבודה ובדיקות
git add .
git commit -m "feat: short description"
git push -u origin feature/<member>-<scope>
```

כל חבר עובד מחשבון GitHub אישי, וכל חבר צריך להופיע ב-history של העבודה
שביצע בפועל. אין להעלות `.env`, סיסמאות, tokens או API keys.
