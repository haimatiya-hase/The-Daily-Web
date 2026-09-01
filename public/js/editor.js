// Keep the editor dashboard inside one small browser module.
(() => {
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

  const statusLabels = {
    draft: "בהכנה",
    pending_review: "ממתינה לאישור",
    published: "פורסמה",
    changes_requested: "הוחזרה לתיקונים"
  };

  let selectedArticleId = null;

  // Show short feedback without inserting user content as HTML.
  function showMessage(message, isError = false) {
    elements.message.textContent = message;
    elements.message.classList.toggle("is-error", isError);
    elements.message.classList.toggle("is-success", !isError && Boolean(message));
  }

  // Read JSON and turn non-success responses into normal JavaScript errors.
  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...options
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error?.message || "הפעולה נכשלה.");
    }

    return body;
  }

  // Return the selected filter values as a query string.
  function getListUrl() {
    const query = new URLSearchParams();
    const search = elements.search.value.trim();
    const status = elements.statusFilter.value;

    if (search) {
      query.set("search", search);
    }

    if (status) {
      query.set("status", status);
    }

    const queryText = query.toString();
    return `/api/editor/articles${queryText ? `?${queryText}` : ""}`;
  }

  // Create one safe queue item with textContent for article data.
  function createQueueItem(article) {
    const button = document.createElement("button");
    const workingVersion = article.workingVersion || {};
    const author = article.author?.displayName || "כתב לא ידוע";

    button.className = "editor-article-item";
    button.type = "button";
    button.dataset.articleId = article._id;
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
    elements.list.replaceChildren();
    elements.totalCount.textContent = String(total);

    if (articles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "loading-indicator";
      empty.textContent = "לא נמצאו כתבות.";
      elements.list.append(empty);
      return;
    }

    for (const article of articles) {
      elements.list.append(createQueueItem(article));
    }
  }

  // Enable or disable fields according to the server workflow state.
  function setEditorMode(status) {
    const canEdit = status === "pending_review";
    const editableFields = [
      elements.title,
      elements.summary,
      elements.content,
      elements.category,
      elements.imageUrl
    ];

    for (const field of editableFields) {
      field.disabled = !canEdit;
    }

    elements.save.disabled = !canEdit;
    elements.publish.disabled = !canEdit;
    elements.requestChanges.disabled = !canEdit;
    elements.requestNote.disabled = !canEdit;
    elements.formCard.classList.toggle("is-readonly", !canEdit);
  }

  // Add a readable label and value to one version comparison card.
  function addVersionField(container, label, value, preserveLines = false) {
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
    const published = article.publishedVersion;
    const working = article.workingVersion;

    elements.publishedVersion.replaceChildren();
    elements.workingVersion.replaceChildren();

    if (!published) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "אין גרסה ציבורית. זו יכולה להיות כתבה חדשה.";
      elements.publishedVersion.append(empty);
    } else {
      addVersionField(elements.publishedVersion, "כותרת", published.title);
      addVersionField(elements.publishedVersion, "קטגוריה", published.category);
      addVersionField(elements.publishedVersion, "תוכן", published.content, true);
    }

    addVersionField(elements.workingVersion, "כותרת", working?.title);
    addVersionField(elements.workingVersion, "קטגוריה", working?.category);
    addVersionField(elements.workingVersion, "תוכן", working?.content, true);
  }

  // Fill the form with the selected article working copy.
  function renderSelectedArticle(article) {
    const working = article.workingVersion || {};
    const status = article.status || "";

    selectedArticleId = article._id;
    elements.selectedTitle.textContent = working.title || "ללא כותרת";
    elements.selectedStatus.textContent = statusLabels[status] || status;
    elements.title.value = working.title || "";
    elements.summary.value = working.summary || "";
    elements.content.value = working.content || "";
    elements.category.value = working.category || "";
    elements.imageUrl.value = working.imageUrl || "";
    elements.requestNote.value = article.editorNote || "";
    setEditorMode(status);
    renderVersionComparison(article);

    // Highlight the selected queue row after the new article is loaded.
    for (const item of elements.list.querySelectorAll(".editor-article-item")) {
      item.classList.toggle("active", item.dataset.articleId === article._id);
    }
  }

  // Request one article from the protected editor API.
  async function selectArticle(articleId) {
    try {
      const result = await requestJson(`/api/editor/articles/${articleId}`);
      renderSelectedArticle(result.article);
      showMessage("");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Load the queue without reloading the whole page.
  async function loadArticles() {
    elements.list.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "loading-indicator";
    loading.textContent = "טוען כתבות...";
    elements.list.append(loading);

    try {
      const result = await requestJson(getListUrl());
      renderQueue(result.items, result.pagination.total);

      // Select the first result when there is no current selection.
      if (!selectedArticleId && result.items[0]) {
        await selectArticle(result.items[0]._id);
      }
    } catch (error) {
      renderQueue([], 0);
      showMessage(error.message, true);
    }
  }

  // Send the edited fields to the server for validation and saving.
  async function saveArticle(event) {
    event.preventDefault();

    if (!selectedArticleId) {
      showMessage("בחרו כתבה לפני שמירה.", true);
      return;
    }

    try {
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
      renderSelectedArticle(result.article);
      showMessage("העריכה נשמרה ונשארה בתור האישור.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  // Publish the working version only after the editor explicitly approves it.
  async function publishArticle() {
    if (!selectedArticleId || !window.confirm("לאשר ולפרסם את הגרסה הזאת?")) {
      return;
    }

    try {
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
    if (!selectedArticleId) {
      showMessage("בחרו כתבה לפני החזרה לתיקונים.", true);
      return;
    }

    const note = elements.requestNote.value.trim();
    if (!note) {
      showMessage("יש לכתוב הערה לפני החזרה לתיקונים.", true);
      elements.requestNote.focus();
      return;
    }

    try {
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
    if (!selectedArticleId || !window.confirm("למחוק את הכתבה לצמיתות?")) {
      return;
    }

    try {
      await requestJson(`/api/editor/articles/${selectedArticleId}`, { method: "DELETE" });
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
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    loadArticles();
  });
  elements.statusFilter.addEventListener("change", loadArticles);
  elements.form.addEventListener("submit", saveArticle);
  elements.publish.addEventListener("click", publishArticle);
  elements.requestChanges.addEventListener("click", sendBackForChanges);
  elements.delete.addEventListener("click", deleteArticle);
  loadArticles();
})();
