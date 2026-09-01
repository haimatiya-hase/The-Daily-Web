(() => {
  const filters = document.querySelector("#feed-filters");
  const healthLink = document.querySelector('a[href="/api/health"]');

  filters?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  healthLink?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
      const health = await response.json();
      window.alert(`שרת: ${health.ok ? "תקין" : "בעיה"}\nמסד נתונים: ${health.database}`);
    } catch (error) {
      window.alert("לא ניתן לקבל את מצב המערכת כרגע.");
    }
  });
})();
