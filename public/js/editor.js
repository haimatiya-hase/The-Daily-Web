// Keep the editor dashboard inside one small browser module.
(() => {
  // Collect the page elements once so every action uses the same references.
  const elements = {
    filters: document.querySelector("#editor-filters"),
    search: document.querySelector("#editor-search"),
    statusFilter: document.querySelector("#editor-status-filter"),
    list: document.querySelector("#editor-article-list"),
    totalCount: document.querySelector("#editor-total-count"),
    message: document.querySelector("#editor-message"),
    form: document.querySelector("#editor-form"),
    formCard: document.querySelector("#editor-form-card"),
    selectedTitle: document.querySelector("#editor-selected-title"),
    selectedStatus: document.querySelector("#editor-selected-status"),
    title: document.querySelector("#editor-title"),
    summary: document.querySelector("#editor-summary"),
    content: document.querySelector("#editor-content"),
    category: document.querySelector("#editor-category"),
    imageUrl: document.querySelector("#editor-image-url"),
    requestNote: document.querySelector("#editor-request-note"),
    save: document.querySelector("#editor-save"),
    publish: document.querySelector("#editor-publish"),
    requestChanges: document.querySelector("#editor-request-changes"),
    delete: document.querySelector("#editor-delete"),
    publishedVersion: document.querySelector("#editor-published-version"),
    workingVersion: document.querySelector("#editor-working-version")
  };

  // Translate stored workflow values into labels shown to the editor.
  const statusLabels = {
    draft: "בהכנה",
    pending_review: "ממתינה לאישור",
    published: "פורסמה",
    changes_requested: "הוחזרה לתיקונים"
  };

  // Remember which queue article is currently open in the form.
  let selectedArticleId = null;

  // Show short feedback without inserting user content as HTML.
  function showMessage(message, isError = false) {
    elements.message.textContent = message;
    elements.message.classList.toggle("is-error", isError);
    elements.message.classList.toggle("is-success", !isError && Boolean(message));
  }

  // Read JSON and turn non-success responses into normal JavaScript errors.
  async function requestJson(url, options = {}) {
    // Send JSON headers because editor actions use the REST API.
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...options
    });
    // Keep an empty object when the server response is not valid JSON.
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Convert the API error into one message that the page can display.
      throw new Error(body.error?.message || "הפעולה נכשלה.");
    }

    return body;
  }

  // Return the selected filter values as a query string.
  function getListUrl() {
    // Build the query only from values that the editor actually selected.
    const query = new URLSearchParams();
    const search = elements.search.value.trim();
    const status = elements.statusFilter.value;

    if (search) {
      // Add the title search only when it is not empty.
      query.set("search", search);
    }

    if (status) {
      // Add the status filter only when a specific status is selected.
      query.set("status", status);
    }

    // Convert the selected filters into the final request URL.
    const queryText = query.toString();
    return `/api/editor/articles${queryText ? `?${queryText}` : ""}`;
  }

  // Create one safe queue item with textContent for article data.
  function createQueueItem(article) {
    // Use a button so the whole queue item is keyboard accessible.
    const button = document.createElement("button");
    const workingVersion = article.workingVersion || {};
    const author = article.author?.displayName || "כתב לא ידוע";

    button.className = "editor-article-item";
    button.type = "button";
    button.dataset.articleId = article._id;
    // Load the article only after the editor selects this queue item.
    button.addEventListener("click", () => selectArticle(article._id));

    const title = document.createElement("strong");
    title.textContent = workingVersion.title || "ללא כותרת";

    const meta = document.createElement("span");
    meta.textContent = `${statusLabels[article.status] || article.status} · ${author}`;

    button.append(title, meta);
    return button;
  }

  // Draw the list returned by the server and keep its text safe.
  function renderQueue(articles, total) {
    // Remove the previous queue before drawing the latest server result.
    elements.list.replaceChildren();
    // Show the total count returned by the database query.
    elements.totalCount.textContent = String(total);

    if (articles.length === 0) {
      // Show a clear empty state instead of leaving a blank panel.
      const empty = document.createElement("p");
      empty.className = "loading-indicator";
      empty.textContent = "לא נמצאו כתבות.";
      elements.list.append(empty);
      return;
    }

    for (const article of articles) {
      // Add each article as a safe DOM node created by createQueueItem.
      elements.list.append(createQueueItem(article));
    }
  }

  // Enable or disable fields according to the server workflow state.
  function setEditorMode(status) {
    // Only pending articles may be changed by the editor screen.
    const canEdit = status === "pending_review";
    const editableFields = [
      elements.title,
      elements.summary,
      elements.content,
      elements.category,
      elements.imageUrl
    ];

    for (const field of editableFields) {
      // Disable the field when the workflow state is read-only.
      field.disabled = !canEdit;
    }

    // Keep all action controls consistent with the same workflow rule.
    elements.save.disabled = !canEdit;
    elements.publish.disabled = !canEdit;
    elements.requestChanges.disabled = !canEdit;
    elements.requestNote.disabled = !canEdit;
    elements.formCard.classList.toggle("is-readonly", !canEdit);
  }

  // Add a readable label and value to one version comparison card.
  function addVersionField(container, label, value, preserveLines = false) {
    // Create elements instead of inserting article text as HTML.
    const wrapper = document.createElement("div");
    const heading = document.createElement("strong");
    const text = document.createElement(preserveLines ? "pre" : "p");

    heading.textContent = label;
    text.textContent = value || "—";
    wrapper.append(heading, text);
    container.append(wrapper);
  }

  // Show the public copy and the working copy next to each other.
  function renderVersionComparison(article) {
    // Read the two versions that the server returned for this article.
    const published = article.publishedVersion;
    const working = article.workingVersion;

    // Clear old comparison content before drawing the new selection.
    elements.publishedVersion.replaceChildren();
    elements.workingVersion.replaceChildren();

    if (!published) {
      // Explain why the public comparison is empty for a new article.
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "אין גרסה ציבורית. זו יכולה להיות כתבה חדשה.";
      elements.publishedVersion.append(empty);
    } else {
      // Show the last approved version that readers can currently see.
      addVersionField(elements.publishedVersion, "כותרת", published.title);
      addVersionField(elements.publishedVersion, "קטגוריה", published.category);
      addVersionField(elements.publishedVersion, "תוכן", published.content, true);
    }

    // Always show the private working version beside the public copy.
    addVersionField(elements.workingVersion, "כותרת", working?.title);
    addVersionField(elements.workingVersion, "קטגוריה", working?.category);
    addVersionField(elements.workingVersion, "תוכן", working?.content, true);
  }

  // Fill the form with the selected article working copy.
  function renderSelectedArticle(article) {
    // Use an empty object when a draft does not have all fields yet.
    const working = article.workingVersion || {};
    const status = article.status || "";

    // Remember the selected id for later save, publish, and delete actions.
    selectedArticleId = article._id;
    elements.selectedTitle.textContent = working.title || "ללא כותרת";
    elements.selectedStatus.textContent = statusLabels[status] || status;
    elements.title.value = working.title || "";
    elements.summary.value = working.summary || "";
    elements.content.value = working.content || "";
    elements.category.value = working.category || "";
    elements.imageUrl.value = working.imageUrl || "";
    elements.requestNote.value = article.editorNote || "";
    // Update inputs, buttons, and version cards for the new workflow state.
    setEditorMode(status);
    renderVersionComparison(article);

    // Highlight the selected queue row after the new article is loaded.
    for (const item of elements.list.querySelectorAll(".editor-article-item")) {
      item.classList.toggle("active", item.dataset.articleId === article._id);
    }
  }

  // Request one article from the protected editor API.
  async function selectArticle(articleId) {
    // Request the selected article from the protected server endpoint.
    try {
      const result = await requestJson(`/api/editor/articles/${articleId}`);
      renderSelectedArticle(result.article);
      showMessage("");
    } catch (error) {
      // Show a safe error while keeping the rest of the dashboard usable.
      showMessage(error.message, true);
    }
  }

  // Load the queue without reloading the whole page.
  async function loadArticles() {
    // Show loading feedback before the queue request starts.
    elements.list.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "loading-indicator";
    loading.textContent = "טוען כתבות...";
    elements.list.append(loading);

    try {
      // Ask the server for the current filtered queue.
      const result = await requestJson(getListUrl());
      renderQueue(result.items, result.pagination.total);

      // Select the first result when there is no current selection.
      if (!selectedArticleId && result.items[0]) {
        await selectArticle(result.items[0]._id);
      }
    } catch (error) {
      // Clear the queue when the request fails and explain the problem.
      renderQueue([], 0);
      showMessage(error.message, true);
    }
  }

  // Send the edited fields to the server for validation and saving.
  async function saveArticle(event) {
    // Stop the browser from performing a full HTML form submission.
    event.preventDefault();

    if (!selectedArticleId) {
      // Do not send an update when the editor has not selected an article.
      showMessage("בחרו כתבה לפני שמירה.", true);
      return;
    }

    try {
      // Send only editable fields; the server controls status and ownership.
      const result = await requestJson(`/api/editor/articles/${selectedArticleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: elements.title.value,
          summary: elements.summary.value,
          content: elements.content.value,
          category: elements.category.value,
          imageUrl: elements.imageUrl.value
        })
      });
      // Refresh the selected card and queue after a successful save.
      renderSelectedArticle(result.article);
      showMessage("העריכה נשמרה ונשארה בתור האישור.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Publish the working version only after the editor explicitly approves it.
  async function publishArticle() {
    // Ask for confirmation because publishing changes public content.
    if (!selectedArticleId || !window.confirm("לאשר ולפרסם את הגרסה הזאת?")) {
      return;
    }

    try {
      // Let the server approve the working version and create the public copy.
      const result = await requestJson(`/api/editor/articles/${selectedArticleId}/publish`, { method: "POST" });
      renderSelectedArticle(result.article);
      showMessage("הכתבה אושרה והגרסה הציבורית עודכנה.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Return a pending article only when the editor supplied a note.
  async function sendBackForChanges() {
    // A correction request must be connected to one selected article.
    if (!selectedArticleId) {
      showMessage("בחרו כתבה לפני החזרה לתיקונים.", true);
      return;
    }

    // Trim the note before sending it to the server for validation.
    const note = elements.requestNote.value.trim();
    if (!note) {
      showMessage("יש לכתוב הערה לפני החזרה לתיקונים.", true);
      elements.requestNote.focus();
      return;
    }

    try {
      // Move the article back to the reporter with the editor explanation.
      const result = await requestJson(`/api/editor/articles/${selectedArticleId}/request-changes`, {
        method: "POST",
        body: JSON.stringify({ note })
      });
      renderSelectedArticle(result.article);
      showMessage("הכתבה הוחזרה לכתב עם הערת התיקון.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Delete the selected article only after a browser confirmation.
  async function deleteArticle() {
    // Ask for confirmation because deletion cannot be undone from this page.
    if (!selectedArticleId || !window.confirm("למחוק את הכתבה לצמיתות?")) {
      return;
    }

    try {
      // Remove the article through the protected editor endpoint.
      await requestJson(`/api/editor/articles/${selectedArticleId}`, { method: "DELETE" });
      // Reset the local selection after the server confirms deletion.
      selectedArticleId = null;
      elements.form.reset();
      elements.selectedTitle.textContent = "בחרו כתבה";
      elements.selectedStatus.textContent = "אין בחירה";
      setEditorMode("");
      elements.publishedVersion.replaceChildren();
      elements.workingVersion.replaceChildren();
      showMessage("הכתבה נמחקה.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Connect the form buttons to AJAX actions.
  // Reload the queue when the editor submits the search form.
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadArticles();
  });
  // Reload immediately when the status dropdown changes.
  elements.statusFilter.addEventListener("change", loadArticles);
  // Save edited fields when the editor submits the article form.
  elements.form.addEventListener("submit", saveArticle);
  // Connect the workflow buttons to their matching actions.
  elements.publish.addEventListener("click", publishArticle);
  elements.requestChanges.addEventListener("click", sendBackForChanges);
  elements.delete.addEventListener("click", deleteArticle);
  // Load the first editor queue as soon as the page is ready.
  loadArticles();
})();
