// Keep the view statistics screen inside one private browser module.
(() => {
  // Collect the page elements once so every action uses the same references.
  const elements = {
    filters: document.querySelector("#stats-filters"),
    search: document.querySelector("#stats-search"),
    sort: document.querySelector("#stats-sort"),
    clear: document.querySelector("#stats-clear"),
    message: document.querySelector("#stats-message"),
    body: document.querySelector("#stats-body"),
    total: document.querySelector("#stats-total"),
    prev: document.querySelector("#stats-prev"),
    next: document.querySelector("#stats-next"),
    pageLabel: document.querySelector("#stats-page-label"),
    selectedTitle: document.querySelector("#stats-selected-title"),
    selectedVersion: document.querySelector("#stats-selected-version"),
    counter: document.querySelector("#stat-counter"),
    last24h: document.querySelector("#stat-24h"),
    last7d: document.querySelector("#stat-7d"),
    buckets: document.querySelector("#stat-buckets"),
    range: document.querySelector("#stat-range"),
    versions: document.querySelector("#stats-versions"),
    rebuild: document.querySelector("#stats-rebuild"),
    delete: document.querySelector("#stats-delete")
  };
  if (!elements.body) return; // Stop safely when the statistics page is not open.

  let page = 1; // Remember the current list page.
  let totalPages = 1; // Remember how many pages the current filters produce.
  let selectedArticleId = null; // Remember which article the detail panel shows.
  let requestVersion = 0; // Identify and ignore stale list responses.
  let searchTimer; // Store the short search delay timer.

  const numberFormat = new Intl.NumberFormat("he-IL"); // Format large counts with separators.
  const dateFormat = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }); // Format hours for Hebrew readers.

  // Show short feedback without inserting user content as HTML.
  const showMessage = (text, isError = false) => {
    elements.message.textContent = text;
    elements.message.classList.toggle("is-error", isError);
    elements.message.classList.toggle("is-success", !isError && Boolean(text));
  };

  // Read JSON and turn non-success responses into normal JavaScript errors.
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { headers: { Accept: "application/json", "Content-Type": "application/json" }, ...options });
    const body = await response.json().catch(() => ({})); // Keep an empty object when the body is not JSON.
    if (!response.ok) throw new Error(body.error?.message || "הפעולה נכשלה."); // Convert the API error into one visible message.
    return body;
  };

  // Format one date safely.
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
  };

  // Build the list URL from the current filters and page.
  const getListUrl = () => {
    const query = new URLSearchParams();
    const search = elements.search.value.trim();
    if (search) query.set("search", search); // Send the search only when it is not empty.
    query.set("sort", elements.sort.value); // Always send the sort order.
    query.set("page", String(page)); // Always send the page number.
    return `/api/views?${query.toString()}`;
  };

  // Add one cell with safe text to a row.
  const addCell = (row, text, className = "") => {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    row.append(cell);
    return cell;
  };

  // Build one clickable table row for an article.
  const createRow = (item) => {
    const row = document.createElement("tr");
    row.dataset.articleId = item.id;
    row.classList.toggle("active", item.id === selectedArticleId); // Highlight the selected article.

    const titleCell = document.createElement("td");
    const button = document.createElement("button"); // Use a button so the row is keyboard accessible.
    button.type = "button";
    button.className = "row-select";
    button.textContent = item.title;
    button.addEventListener("click", () => selectArticle(item.id));
    titleCell.append(button);
    row.append(titleCell);

    addCell(row, numberFormat.format(item.totalViews), "stats-number");
    addCell(row, numberFormat.format(item.last24h), "stats-number");
    addCell(row, numberFormat.format(item.last7d), "stats-number");
    addCell(row, `v${item.currentVersion}`, "stats-number");
    return row;
  };

  // Draw one list page returned by the server.
  const renderList = (result) => {
    elements.body.replaceChildren();
    elements.total.textContent = numberFormat.format(result.total);
    totalPages = result.pagination.totalPages;
    page = result.pagination.page;
    elements.pageLabel.textContent = `עמוד ${page} מתוך ${totalPages}`;
    elements.prev.disabled = page <= 1;
    elements.next.disabled = page >= totalPages;

    if (result.items.length === 0) { // Show a clear empty state instead of a blank table.
      const row = document.createElement("tr");
      addCell(row, "לא נמצאו כתבות מתאימות.", "loading-indicator").colSpan = 5;
      elements.body.append(row);
      return;
    }

    for (const item of result.items) elements.body.append(createRow(item));
  };

  // Load the list without reloading the page.
  const loadList = async () => {
    const version = ++requestVersion; // Mark this request so a slower older one is ignored.
    try {
      const result = await requestJson(getListUrl());
      if (version !== requestVersion) return; // Drop a stale response.
      renderList(result);
      if (!selectedArticleId && result.items[0]) await selectArticle(result.items[0].id); // Open the first article when nothing is selected yet.
    } catch (error) {
      showMessage(error.message, true);
    }
  };

  // Fill the detail panel from one summary object.
  const renderSummary = (summary) => {
    selectedArticleId = summary.article.id;
    elements.selectedTitle.textContent = summary.article.title;
    elements.selectedVersion.textContent = `גרסה נוכחית v${summary.article.currentVersion}`;
    elements.counter.textContent = numberFormat.format(summary.totals.counter);
    elements.last24h.textContent = numberFormat.format(summary.totals.last24h);
    elements.last7d.textContent = numberFormat.format(summary.totals.last7d);
    elements.buckets.textContent = numberFormat.format(summary.totals.buckets);

    // Show the recorded range and warn when the counter and the buckets disagree.
    const drift = summary.totals.counter !== summary.totals.bucketed;
    const driftText = drift ? ` · המונה (${summary.totals.counter}) שונה מסכום השעות (${summary.totals.bucketed}) — מומלץ לחשב מחדש.` : "";
    elements.range.textContent = summary.totals.firstViewAt
      ? `נתונים מ-${formatDate(summary.totals.firstViewAt)} עד ${formatDate(summary.totals.lastViewAt)}${driftText}`
      : `אין שעות מתועדות לכתבה הזאת${driftText}`;
    elements.range.classList.toggle("error-text", drift);

    // Draw the per-version breakdown.
    elements.versions.replaceChildren();
    const versionTotal = summary.byVersion.reduce((sum, entry) => sum + entry.views, 0);
    if (summary.byVersion.length === 0) {
      const row = document.createElement("tr");
      addCell(row, "אין צפיות שנרשמו לפי גרסה.", "form-note").colSpan = 3;
      elements.versions.append(row);
    }
    for (const entry of summary.byVersion) {
      const row = document.createElement("tr");
      addCell(row, `v${entry.versionNumber}`);
      addCell(row, numberFormat.format(entry.views), "stats-number");
      addCell(row, versionTotal ? `${Math.round((entry.views / versionTotal) * 100)}%` : "0%", "stats-number");
      elements.versions.append(row);
    }

    elements.rebuild.disabled = false; // Allow the update action for the selected article.
    elements.delete.disabled = false; // Allow the delete action for the selected article.

    // Highlight the selected row and tell the shared chart which article to draw.
    for (const row of elements.body.querySelectorAll("tr[data-article-id]")) row.classList.toggle("active", row.dataset.articleId === selectedArticleId);
    document.dispatchEvent(new CustomEvent("editor:article-selected", { detail: { articleId: selectedArticleId } }));
  };

  // Request the summary of one article.
  const selectArticle = async (articleId) => {
    try {
      renderSummary(await requestJson(`/api/views/${articleId}`));
      showMessage("");
    } catch (error) {
      showMessage(error.message, true);
    }
  };

  // Rebuild the counters of the selected article from its raw events.
  const rebuildStats = async () => {
    if (!selectedArticleId) return;
    elements.rebuild.disabled = true;
    try {
      const result = await requestJson(`/api/views/${selectedArticleId}/rebuild`, { method: "POST" });
      renderSummary(result.summary);
      showMessage(`החישוב הושלם: ${numberFormat.format(result.result.total)} צפיות ב-${result.result.buckets} שעות.`);
      await loadList(); // Refresh the totals in the list.
    } catch (error) {
      showMessage(error.message, true);
      elements.rebuild.disabled = false;
    }
  };

  // Delete every view record of the selected article after confirmation.
  const deleteStats = async () => {
    if (!selectedArticleId || !window.confirm("למחוק את כל נתוני הצפייה של הכתבה? הפעולה אינה ניתנת לביטול.")) return;
    elements.delete.disabled = true;
    try {
      const result = await requestJson(`/api/views/${selectedArticleId}`, { method: "DELETE" });
      renderSummary(result.summary);
      showMessage(`נמחקו ${numberFormat.format(result.result.deletedEvents)} אירועי צפייה ו-${result.result.deletedBuckets} שעות.`);
      await loadList(); // Refresh the totals in the list.
    } catch (error) {
      showMessage(error.message, true);
      elements.delete.disabled = false;
    }
  };

  // Reload the list when the editor submits the filters.
  elements.filters.addEventListener("submit", (event) => { event.preventDefault(); page = 1; loadList(); });
  // Search while typing with a short delay so the server is not called on every key.
  elements.search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; loadList(); }, 300); });
  // Reload immediately when the sort changes.
  elements.sort.addEventListener("change", () => { page = 1; loadList(); });
  // Restore the default filters and reload.
  elements.clear.addEventListener("click", () => { elements.search.value = ""; elements.sort.value = "total"; page = 1; showMessage(""); loadList(); });
  // Move between pages.
  elements.prev.addEventListener("click", () => { if (page > 1) { page -= 1; loadList(); } });
  elements.next.addEventListener("click", () => { if (page < totalPages) { page += 1; loadList(); } });
  // Connect the update and delete actions.
  elements.rebuild.addEventListener("click", rebuildStats);
  elements.delete.addEventListener("click", deleteStats);
  // Load the first page as soon as the page is ready.
  loadList();
})();
