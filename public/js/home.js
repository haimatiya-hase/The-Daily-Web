// Find the controls that are available on the home page.
(() => {
  const filters = document.querySelector("#feed-filters");
  const feed = document.querySelector("#feed");
  const loadingIndicator = document.querySelector("#feed-loading");
  const feedSentinel = document.querySelector("#feed-sentinel");
  const feedEnd = document.querySelector("#feed-end");
  const searchInput = filters?.querySelector('input[name="search"]');
  const categorySelect = filters?.querySelector('select[name="category"]');
  const viewStatusSelect = filters?.querySelector('select[name="viewStatus"]');
  const sortSelect = filters?.querySelector('select[name="sort"]');
  const healthLink = document.querySelector('a[href="/api/health"]');
  // Find the area that displays weather on the home page.
  const weatherContent = document.querySelector("#weather-content");
  let nextCursor = null;
  let isFeedLoading = false;
  let hasMoreArticles = true;
  let activeSearch = "";
  let activeCategory = "";
  let activeViewStatus = "";
  let activeSort = "publishedAt";
  let feedRequestVersion = 0;
  let searchTimer;

  // Reuse one anonymous browser key so view filters can match saved events.
  function getClientKey() {
    const storageKey = "dailyWebClientKey";

    try {
      let value = localStorage.getItem(storageKey);
      if (!value) {
        value = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        localStorage.setItem(storageKey, value);
      }
      return value;
    } catch (error) {
      return "";
    }
  }

  const clientKey = getClientKey();

  // Format a valid publication date for Hebrew readers.
  function formatPublishedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(date);
  }

  // Build one safe article card without inserting API values as HTML.
  function createArticleCard(article) {
    const card = document.createElement("article");
    card.className = "article-card";

    if (article.imageUrl) {
      const image = document.createElement("img");
      image.className = "article-card-image";
      image.src = article.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      card.append(image);
    }

    const content = document.createElement("div");
    content.className = "article-card-content";
    const category = document.createElement("div");
    category.className = "eyebrow";
    category.textContent = article.category || "חדשות";
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = `/articles/${article.id}`;
    link.textContent = article.title || "כתבה ללא כותרת";
    title.append(link);
    const summary = document.createElement("p");
    summary.textContent = article.summary || "";
    const meta = document.createElement("p");
    meta.className = "article-card-meta";
    meta.textContent = [article.authorName, formatPublishedDate(article.publishedAt)].filter(Boolean).join(" · ");
    content.append(category, title, summary, meta);
    card.append(content);
    return card;
  }

  // Replace the feed with a friendly empty or error message.
  function showFeedMessage(title, message) {
    if (!feed) return;
    const state = document.createElement("article");
    state.className = "empty-state feed-empty";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const text = document.createElement("p");
    text.textContent = message;
    state.append(heading, text);
    feed.replaceChildren(state);
  }

  // Request and append the next twenty public articles.
  async function loadFeed() {
    if (!feed || !loadingIndicator || isFeedLoading || !hasMoreArticles) return;

    const requestVersion = ++feedRequestVersion;
    const requestedCursor = nextCursor;
    isFeedLoading = true;
    loadingIndicator.textContent = "טוען כתבות...";
    loadingIndicator.hidden = false;

    try {
      const parameters = new URLSearchParams();
      if (requestedCursor) parameters.set("cursor", requestedCursor);
      if (activeSearch) parameters.set("search", activeSearch);
      if (activeCategory) parameters.set("category", activeCategory);
      if (activeViewStatus) parameters.set("viewStatus", activeViewStatus);
      parameters.set("sort", activeSort);
      const headers = { Accept: "application/json" };
      if (clientKey) headers["X-Client-Key"] = clientKey;
      const response = await fetch(`/api/articles?${parameters}`, { headers });
      if (!response.ok) throw new Error("Feed request failed");
      const data = await response.json();
      const articles = Array.isArray(data.articles) ? data.articles : [];

      // Ignore an older response after the visitor starts a newer search.
      if (requestVersion !== feedRequestVersion) return;

      if (!requestedCursor && articles.length === 0) {
        const hasActiveFilter = activeSearch || activeCategory || activeViewStatus;
        const title = hasActiveFilter ? "לא נמצאו כתבות מתאימות" : "עדיין אין כתבות שפורסמו";
        const message = hasActiveFilter ? "אפשר לשנות את החיפוש או את הסינון." : "כתבות שאושרו יופיעו כאן ברגע שיפורסמו.";
        showFeedMessage(title, message);
        hasMoreArticles = false;
        return;
      }

      feed.append(...articles.map(createArticleCard));
      hasMoreArticles = data.pagination?.hasMore === true;
      nextCursor = data.pagination?.nextCursor || null;

      if (!hasMoreArticles && feedEnd) {
        feedEnd.hidden = false;
      }
    } catch (error) {
      if (requestVersion !== feedRequestVersion) return;
      if (!requestedCursor) {
        showFeedMessage("לא הצלחנו לטעון את הכתבות", "אפשר לרענן את העמוד ולנסות שוב בעוד רגע.");
        hasMoreArticles = false;
      } else {
        loadingIndicator.textContent = "לא הצלחנו לטעון כתבות נוספות. אפשר לגלול ולנסות שוב.";
      }
    } finally {
      if (requestVersion === feedRequestVersion) {
        isFeedLoading = false;
        if (loadingIndicator.textContent === "טוען כתבות...") loadingIndicator.hidden = true;
      }
    }
  }

  // Clear old cards and restart pagination for the selected feed controls.
  function resetFeed() {
    if (!feed) return;
    feedRequestVersion += 1;
    isFeedLoading = false;
    activeSearch = searchInput?.value.trim() || "";
    activeCategory = categorySelect?.value || "";
    activeViewStatus = viewStatusSelect?.value || "";
    activeSort = sortSelect?.value || "publishedAt";
    nextCursor = null;
    hasMoreArticles = true;
    feed.replaceChildren();
    if (feedEnd) feedEnd.hidden = true;
    loadFeed();
  }

  // Watch the end of the feed and request another page when it approaches.
  function startInfiniteScroll() {
    if (!feedSentinel || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadFeed();
    }, { rootMargin: "300px" });
    observer.observe(feedSentinel);
  }

  // Convert standard weather codes into short Hebrew descriptions.
  function describeWeather(code) {
    // Describe clear and mainly clear conditions.
    if ([0, 1].includes(code)) return "בהיר";
    // Describe partly cloudy and overcast conditions.
    if ([2, 3].includes(code)) return "מעונן";
    // Describe fog conditions.
    if ([45, 48].includes(code)) return "ערפילי";
    // Describe drizzle and rain conditions.
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "גשום";
    // Describe snow conditions.
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "מושלג";
    // Describe thunderstorm conditions.
    if ([95, 96, 99].includes(code)) return "סופת רעמים";
    // Use a general description for an unfamiliar service code.
    return "מצב משתנה";
  }

  // Replace the loading message with a friendly unavailable state.
  function showWeatherUnavailable() {
    // Stop when the current page does not contain the weather widget.
    if (!weatherContent) return;
    // Show a safe message without exposing technical error details.
    weatherContent.innerHTML = '<p class="weather-status">נתוני מזג האוויר אינם זמינים כרגע.</p>';
  }

  // Request current weather from the local server API.
  async function loadWeather() {
    // Stop when the current page does not contain the weather widget.
    if (!weatherContent) return;

    // Handle network and server errors without affecting the rest of the page.
    try {
      // Ask the local API for its small cached weather response.
      const response = await fetch("/api/weather", { headers: { Accept: "application/json" } });
      // Parse the JSON body returned by the local API.
      const weather = await response.json();

      // Show the unavailable state for failed or incomplete responses.
      if (!response.ok || !weather.available || !Number.isFinite(weather.temperature)) {
        // Replace the loading message with the unavailable message.
        showWeatherUnavailable();
        // Stop before trying to display missing values.
        return;
      }

      // Convert the numeric service code into readable text.
      const description = describeWeather(weather.weatherCode);
      // Round the temperature so the compact card remains easy to scan.
      const temperature = Math.round(weather.temperature);
      // Display only values created by this script, not external HTML.
      weatherContent.innerHTML = `<strong class="weather-temperature">${temperature}°</strong><span class="weather-description">${description}</span>`;
    // Recover when the browser cannot reach or parse the local API.
    } catch (error) {
      // Replace the loading message with the unavailable message.
      showWeatherUnavailable();
    }
  }

  // Search through AJAX without reloading the page.
  filters?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    resetFeed();
  });

  // Wait briefly while the visitor types before starting a new search.
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetFeed, 350);
  });

  // Apply category, view, and sort controls immediately without refreshing the page.
  filters?.addEventListener("change", (event) => {
    if (!event.target.matches('select[name="category"], select[name="viewStatus"], select[name="sort"]')) return;
    clearTimeout(searchTimer);
    resetFeed();
  });

  // Check the server asynchronously from the browser.
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

  // Load weather after the page controls are ready.
  loadWeather();
  // Load the first public news cards beside the weather widget.
  loadFeed();
  // Start watching for the next page after the initial request begins.
  startInfiniteScroll();
})();
