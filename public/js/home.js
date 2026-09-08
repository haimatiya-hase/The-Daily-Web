// Find the controls that are available on the home page.
(() => { // Keep home-page variables private from other browser scripts.
  const filters = document.querySelector("#feed-filters"); // Find the form that controls search, filters, and sorting.
  const feed = document.querySelector("#feed"); // Find the container that receives article cards.
  const loadingIndicator = document.querySelector("#feed-loading"); // Find the feed loading message.
  const feedSentinel = document.querySelector("#feed-sentinel"); // Find the invisible infinite-scroll target.
  const feedEnd = document.querySelector("#feed-end"); // Find the final-page message.
  const feedCount = document.querySelector("#feed-count"); // Find the visible loaded-card counter.
  const retryPanel = document.querySelector("#feed-retry"); // Find the feed recovery area.
  const retryMessage = document.querySelector("#feed-retry-message"); // Find the recovery message text.
  const retryButton = document.querySelector("#feed-retry-button"); // Find the button that retries a failed page.
  const clearFiltersButton = document.querySelector("#feed-clear"); // Find the button that restores default controls.
  const searchInput = filters?.querySelector('input[name="search"]'); // Find the public article search field.
  const categorySelect = filters?.querySelector('select[name="category"]'); // Find the category filter.
  const viewStatusSelect = filters?.querySelector('select[name="viewStatus"]'); // Find the viewed-state filter.
  const sortSelect = filters?.querySelector('select[name="sort"]'); // Find the feed sort control.
  // Find the area that displays weather on the home page.
  const weatherContent = document.querySelector("#weather-content"); // Find the area that receives current weather.
  let nextCursor = null; // Store the cursor returned for the next feed page.
  let isFeedLoading = false; // Prevent two feed requests from running together.
  let hasMoreArticles = true; // Remember whether infinite scroll may request another page.
  let activeSearch = ""; // Store the normalized search currently sent to the server.
  let activeCategory = ""; // Store the selected category.
  let activeViewStatus = ""; // Store the selected viewed-state filter.
  let activeSort = "publishedAt"; // Start with newest articles first.
  let loadedArticleCount = 0; // Count cards shown by the current query.
  let feedRequestVersion = 0; // Identify and ignore stale AJAX responses.
  let searchTimer; // Store the short search delay timer.

  // Reuse one anonymous browser key so view filters can match saved events.
  function getClientKey() { // Return one reusable anonymous key for this browser.
    const storageKey = "dailyWebClientKey"; // Keep the shared storage name in one place.

    try { // Recover safely when browser storage is unavailable.
      let value = localStorage.getItem(storageKey); // Reuse the browser key from an earlier visit.
      if (!value) { // Create a key only on the first visit.
        value = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; // Prefer a secure browser UUID and keep a simple fallback.
        localStorage.setItem(storageKey, value); // Save the key for later viewed-state requests.
      }
      return value; // Return the existing or newly created browser key.
    } catch (error) { // Handle private browsing or blocked storage.
      return ""; // Disable personal view filtering instead of breaking the feed.
    }
  }

  const clientKey = getClientKey(); // Read the anonymous key once for all feed requests.

  // Format a valid publication date for Hebrew readers.
  function formatPublishedDate(value) { // Format one approved date for Hebrew readers.
    const date = new Date(value); // Convert the API value into a browser Date.
    if (Number.isNaN(date.getTime())) return ""; // Hide invalid dates instead of showing broken text.
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(date); // Return a clear local date.
  }

  // Build one safe article card without inserting API values as HTML.
  function createArticleCard(article) { // Build one public card using safe DOM text methods.
    const card = document.createElement("article"); // Create the semantic card wrapper.
    card.className = "article-card"; // Apply the shared article-card design.

    if (article.imageUrl) { // Add an image only when the approved version provides one.
      const image = document.createElement("img"); // Create the main card image.
      image.className = "article-card-image"; // Apply consistent image sizing.
      image.src = article.imageUrl; // Use the approved image address returned by the API.
      image.alt = ""; // Mark the image as decorative because the title already identifies the story.
      image.loading = "lazy"; // Delay images that are still below the screen.
      card.append(image); // Place the image before the article text.
    } else { // Handle approved articles that have no image value.
      card.classList.add("article-card-no-image"); // Let the text use the full card width.
    }

    const content = document.createElement("div"); // Create a wrapper for approved text and metadata.
    content.className = "article-card-content"; // Apply the card-content spacing.
    const category = document.createElement("div"); // Create the category label.
    category.className = "eyebrow"; // Reuse the small uppercase-style label design.
    category.textContent = article.category || "חדשות"; // Show the approved category or a safe fallback.
    const title = document.createElement("h3"); // Create the card heading.
    const link = document.createElement("a"); // Create the link to the full article page.
    link.href = `/articles/${article.id}`; // Build the article URL from its safe database ID.
    link.textContent = article.title || "כתבה ללא כותרת"; // Insert the approved title as plain text.
    title.append(link); // Place the article link inside the heading.
    const summary = document.createElement("p"); // Create the short card summary.
    summary.textContent = article.summary || ""; // Insert the approved summary as plain text.
    const meta = document.createElement("p"); // Create the author, date, and views line.
    meta.className = "article-card-meta"; // Apply the quiet metadata style.
    const viewCount = Number.isFinite(Number(article.viewCount)) ? Number(article.viewCount) : 0; // Convert invalid popularity data to zero.
    meta.textContent = [article.authorName, formatPublishedDate(article.publishedAt), `${viewCount} צפיות`].filter(Boolean).join(" · "); // Join available public metadata into one line.
    content.append(category, title, summary, meta); // Add all approved text fields to the content wrapper.
    card.append(content); // Add the text wrapper after the optional image.
    return card; // Return the complete safe DOM card.
  }

  // Replace the feed with a friendly empty or error message.
  function showFeedMessage(title, message) { // Replace cards with one friendly feed state.
    if (!feed) return; // Stop when this page does not contain the feed.
    const state = document.createElement("article"); // Create a semantic message card.
    state.className = "empty-state feed-empty"; // Apply the shared empty-state design.
    const heading = document.createElement("h3"); // Create the state heading.
    heading.textContent = title; // Insert the safe state title.
    const text = document.createElement("p"); // Create the explanatory message.
    text.textContent = message; // Insert the safe state details.
    state.append(heading, text); // Combine the heading and message.
    feed.replaceChildren(state); // Replace old cards with the new state.
  }

  // Update the small heading badge with the number of cards currently shown.
  function updateFeedCount(message) { // Update the small feed status badge.
    if (feedCount) feedCount.textContent = message || `${loadedArticleCount} כתבות נטענו`; // Show a custom state or the loaded-card count.
  }

  // Show a manual recovery action after a failed feed request.
  function showFeedRetry(message) { // Show a manual recovery option after an error.
    if (retryMessage) retryMessage.textContent = message; // Explain which feed request failed.
    if (retryPanel) retryPanel.hidden = false; // Reveal the retry action.
  }

  // Hide old error feedback before a new request begins.
  function hideFeedRetry() { // Hide feedback from an older failed request.
    if (retryPanel) retryPanel.hidden = true; // Remove the retry panel while a new request runs.
  }

  // Request and append the next twenty public articles.
  async function loadFeed() { // Request and display the next public feed page.
    if (!feed || !loadingIndicator || isFeedLoading || !hasMoreArticles) return; // Stop when loading is impossible or unnecessary.

    const requestVersion = ++feedRequestVersion; // Give this request a number used to ignore stale responses.
    const requestedCursor = nextCursor; // Preserve the exact page cursor for retries and response handling.
    isFeedLoading = true; // Block another request until this one finishes.
    feed.setAttribute("aria-busy", "true"); // Tell assistive technology that the feed is updating.
    if (retryButton) retryButton.disabled = true; // Prevent repeated retry clicks during loading.
    hideFeedRetry(); // Hide any error from the previous attempt.
    loadingIndicator.textContent = "טוען כתבות..."; // Show the normal loading message.
    loadingIndicator.hidden = false; // Reveal loading feedback.

    try { // Handle network and server errors without reloading the page.
      const parameters = new URLSearchParams(); // Build a safe query string for the feed API.
      if (requestedCursor) parameters.set("cursor", requestedCursor); // Continue from the last visible article when needed.
      if (activeSearch) parameters.set("search", activeSearch); // Send search text only when it is not empty.
      if (activeCategory) parameters.set("category", activeCategory); // Send the selected category only when active.
      if (activeViewStatus) parameters.set("viewStatus", activeViewStatus); // Send the selected viewed-state only when active.
      parameters.set("sort", activeSort); // Always tell the server which stable order to use.
      const headers = { Accept: "application/json" }; // Ask the API for its JSON response.
      if (clientKey) headers["X-Client-Key"] = clientKey; // Send the anonymous browser key when storage is available.
      const response = await fetch(`/api/articles?${parameters}`, { headers }); // Request one feed page through AJAX.
      if (!response.ok) throw new Error("Feed request failed"); // Move failed HTTP responses into the normal recovery path.
      const data = await response.json(); // Parse the successful API response.
      const articles = Array.isArray(data.articles) ? data.articles : []; // Use an empty list when the response shape is unexpected.

      // Ignore an older response after the visitor starts a newer search.
      if (requestVersion !== feedRequestVersion) return; // Ignore an older response after the controls changed.

      if (!requestedCursor && articles.length === 0) { // Handle an empty first page separately from the end of a long feed.
        const hasActiveFilter = activeSearch || activeCategory || activeViewStatus; // Detect whether controls caused the empty result.
        const title = hasActiveFilter ? "לא נמצאו כתבות מתאימות" : "עדיין אין כתבות שפורסמו"; // Choose a clear empty-state title.
        const message = hasActiveFilter ? "אפשר לשנות את החיפוש או את הסינון." : "כתבות שאושרו יופיעו כאן ברגע שיפורסמו."; // Explain how the visitor can continue.
        showFeedMessage(title, message); // Replace the feed with the selected empty state.
        hasMoreArticles = false; // Stop infinite scroll for this empty query.
        updateFeedCount("אין תוצאות"); // Update the status badge.
        return; // Stop before adding cards or a cursor.
      }

      // Remove a first-page error message before a successful retry adds cards.
      if (!requestedCursor) feed.replaceChildren(); // Clear an older first page before showing the new query.
      feed.append(...articles.map(createArticleCard)); // Build and append every approved article card.
      loadedArticleCount += articles.length; // Increase the visible card count.
      updateFeedCount(); // Show the updated count in the heading.
      nextCursor = data.pagination?.nextCursor || null; // Store the cursor for the next page.
      hasMoreArticles = data.pagination?.hasMore === true && Boolean(nextCursor); // Continue only when the API supplies a real cursor.

      if (!hasMoreArticles && feedEnd) { // Reveal the final-page message after the last successful response.
        feedEnd.hidden = false; // Tell the visitor that every result is loaded.
      }
    } catch (error) { // Recover from network, HTTP, and JSON failures.
      if (requestVersion !== feedRequestVersion) return; // Ignore an obsolete request failure.
      if (!requestedCursor) { // Replace the feed only when its first page failed.
        showFeedMessage("לא הצלחנו לטעון את הכתבות", "אפשר לנסות שוב בעוד רגע."); // Show a friendly first-page error.
        updateFeedCount("הטעינה נכשלה"); // Mark the visible feed status as failed.
        showFeedRetry("לא הצלחנו לטעון את הפיד."); // Offer a first-page retry.
      } else { // Keep existing cards when only a later page failed.
        showFeedRetry("לא הצלחנו לטעון כתבות נוספות."); // Offer a retry for the same saved cursor.
      }
      hasMoreArticles = false; // Pause automatic loading until the visitor requests a retry.
    } finally { // Restore the interface after either success or failure.
      if (requestVersion === feedRequestVersion) { // Change state only when this is still the newest request.
        isFeedLoading = false; // Allow a later page or retry request.
        feed.setAttribute("aria-busy", "false"); // Announce that the current update finished.
        if (retryButton) retryButton.disabled = false; // Make the recovery action available again.
        if (loadingIndicator.textContent === "טוען כתבות...") loadingIndicator.hidden = true; // Hide normal loading feedback.
      }
    }
  }

  // Clear old cards and restart pagination for the selected feed controls.
  function resetFeed() { // Start a fresh query after any control change.
    if (!feed) return; // Stop when this page has no public feed.
    feedRequestVersion += 1; // Make older in-flight responses obsolete.
    isFeedLoading = false; // Allow the replacement request to begin immediately.
    activeSearch = searchInput?.value.trim() || ""; // Read and trim the current search text.
    activeCategory = categorySelect?.value || ""; // Read the current category.
    activeViewStatus = viewStatusSelect?.value || ""; // Read the current viewed-state.
    activeSort = sortSelect?.value || "publishedAt"; // Read the sort mode with a safe default.
    loadedArticleCount = 0; // Reset the visible article counter.
    nextCursor = null; // Return pagination to the first page.
    hasMoreArticles = true; // Allow the new first page to load.
    feed.replaceChildren(); // Remove cards from the previous query.
    feed.setAttribute("aria-busy", "true"); // Announce that replacement results are loading.
    updateFeedCount("טוען כתבות..."); // Show loading in the heading badge.
    hideFeedRetry(); // Remove an old recovery message.
    if (feedEnd) feedEnd.hidden = true; // Hide the previous query's final-page message.
    loadFeed(); // Request the first page with the new controls.
  }

  // Watch the end of the feed and request another page when it approaches.
  function startInfiniteScroll() { // Watch the bottom of the feed for automatic loading.
    if (!feedSentinel || !("IntersectionObserver" in window)) return; // Stop when the page or browser cannot support observation.
    const observer = new IntersectionObserver((entries) => { // Run when the sentinel approaches the screen.
      if (entries[0].isIntersecting) loadFeed(); // Request the next page only when the sentinel is visible.
    }, { rootMargin: "300px" }); // Begin loading slightly before the visitor reaches the end.
    observer.observe(feedSentinel); // Start watching the single feed sentinel.
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
  filters?.addEventListener("submit", (event) => { // Handle the search form without a page reload.
    event.preventDefault(); // Stop the browser's normal form navigation.
    clearTimeout(searchTimer); // Cancel a pending typing delay.
    resetFeed(); // Start a fresh AJAX query with current controls.
  });

  // Wait briefly while the visitor types before starting a new search.
  searchInput?.addEventListener("input", () => { // React while the visitor types a search term.
    clearTimeout(searchTimer); // Restart the delay after each new character.
    searchTimer = setTimeout(resetFeed, 350); // Wait briefly before sending the AJAX request.
  });

  // Apply category, view, and sort controls immediately without refreshing the page.
  filters?.addEventListener("change", (event) => { // React immediately to select-control changes.
    if (!event.target.matches('select[name="category"], select[name="viewStatus"], select[name="sort"]')) return; // Ignore unrelated form changes.
    clearTimeout(searchTimer); // Cancel a search request that has not started yet.
    resetFeed(); // Load results for the new filters or sort.
  });

  // Restore every feed control to its initial value with one action.
  clearFiltersButton?.addEventListener("click", () => { // Restore every feed control with one action.
    filters?.reset(); // Reset form controls to their HTML defaults.
    clearTimeout(searchTimer); // Cancel a delayed search request.
    resetFeed(); // Load the default first page again.
    searchInput?.focus(); // Return keyboard focus to search.
  });

  // Retry the same first page or cursor after a temporary request failure.
  retryButton?.addEventListener("click", () => { // Retry the exact page that failed.
    hasMoreArticles = true; // Allow the saved cursor to be requested again.
    loadFeed(); // Repeat the failed AJAX request.
  });

  // Load weather after the page controls are ready.
  loadWeather();
  // Load the first public news cards beside the weather widget.
  loadFeed(); // Request the first public feed page.
  // Start watching for the next page after the initial request begins.
  startInfiniteScroll(); // Enable automatic loading near the bottom of the page.
})();
