// Keep the comment moderation page inside one private browser module.
(() => {
  // Collect the page elements once so every action uses the same references.
  const elements = {
    filters: document.querySelector("#moderation-filters"),
    search: document.querySelector("#moderation-search"),
    status: document.querySelector("#moderation-status"),
    clear: document.querySelector("#moderation-clear"),
    message: document.querySelector("#moderation-message"),
    list: document.querySelector("#moderation-list"),
    total: document.querySelector("#moderation-total"),
    loadMore: document.querySelector("#moderation-load-more")
  };
  if (!elements.list) return; // Stop safely when the moderation page is not open.

  let nextCursor = null; // Remember where the next queue page starts.
  let requestVersion = 0; // Identify and ignore stale AJAX responses.
  let searchTimer; // Store the short search delay timer.

  // Show short feedback without inserting user content as HTML.
  const showMessage = (text, isError = false) => {
    elements.message.textContent = text;
    elements.message.classList.toggle("is-error", isError);
    elements.message.classList.toggle("is-success", !isError && Boolean(text));
  };

  // Read JSON and turn non-success responses into normal JavaScript errors.
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...options
    });
    const body = await response.json().catch(() => ({})); // Keep an empty object when the body is not JSON.

    if (!response.ok) {
      throw new Error(body.error?.message || "הפעולה נכשלה."); // Convert the API error into one visible message.
    }

    return body;
  };

  // Format one comment time for Hebrew readers.
  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(date);
  };

  // Build the queue URL from the current filters and the optional cursor.
  const getQueueUrl = (cursor) => {
    const query = new URLSearchParams();
    const search = elements.search.value.trim();
    if (search) query.set("search", search); // Send the search only when it is not empty.
    query.set("status", elements.status.value); // Always send the visibility filter.
    if (cursor) query.set("cursor", cursor); // Continue after the last loaded comment.
    return `/api/comments?${query.toString()}`;
  };

  // Create one action button with a safe label.
  const createButton = (label, className, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  };

  // Update one card so it reflects the latest server state of the comment.
  const applyCommentState = (card, comment) => {
    card.dataset.deleted = comment.deletedAt ? "true" : "false"; // Remember visibility for filter decisions.
    card.classList.toggle("is-deleted", Boolean(comment.deletedAt)); // Dim hidden comments.
    card.querySelector(".moderation-body").textContent = comment.body; // Show the current text safely.
    card.querySelector(".moderation-visibility").textContent = comment.deletedAt ? "מוסתרת" : "גלויה"; // Label the visibility.
    card.querySelector(".moderation-visibility").className = `status-pill moderation-visibility ${comment.deletedAt ? "status-changes_requested" : "status-published"}`; // Reuse the workflow pill colors.
    const toggle = card.querySelector(".moderation-toggle");
    toggle.textContent = comment.deletedAt ? "שחזור" : "הסתרה"; // Offer the opposite action.
    toggle.className = `button moderation-toggle ${comment.deletedAt ? "button-secondary" : "button-danger"}`; // Use the danger color only for hiding.
    card.querySelector(".moderation-edit").disabled = Boolean(comment.deletedAt); // Allow editing only on visible comments.
  };

  // Remove a card when it no longer matches the active visibility filter.
  const dropIfFiltered = (card, comment) => {
    const status = elements.status.value;
    const hidden = Boolean(comment.deletedAt);
    if ((status === "visible" && hidden) || (status === "deleted" && !hidden)) {
      card.remove(); // Keep the list consistent with the selected filter.
      elements.total.textContent = String(Math.max(Number(elements.total.textContent || 0) - 1, 0)); // Keep the counter honest.
      if (!elements.list.querySelector(".moderation-item")) renderEmpty(); // Show the empty state when the page runs out.
    }
  };

  // Hide or restore one comment through the protected API.
  const toggleVisibility = async (card, commentId) => {
    const isDeleted = card.dataset.deleted === "true";
    const question = isDeleted ? "לשחזר את התגובה לאתר?" : "להסתיר את התגובה מהאתר?";
    if (!window.confirm(question)) return; // Ask before changing what readers can see.

    try {
      const result = isDeleted
        ? await requestJson(`/api/comments/${commentId}/restore`, { method: "POST" })
        : await requestJson(`/api/comments/${commentId}`, { method: "DELETE" });
      applyCommentState(card, result.comment); // Reflect the confirmed server state.
      showMessage(isDeleted ? "התגובה שוחזרה." : "התגובה הוסתרה.");
      dropIfFiltered(card, result.comment); // Remove the card when the filter no longer matches it.
    } catch (error) {
      showMessage(error.message, true);
    }
  };

  // Open an inline editor, save through PATCH, and close it again.
  const startEditing = (card, commentId) => {
    const body = card.querySelector(".moderation-body");
    const editor = card.querySelector(".moderation-editor");
    const actions = card.querySelector(".moderation-actions");
    const editActions = card.querySelector(".moderation-edit-actions");

    editor.value = body.textContent; // Start from the current text.
    body.hidden = true; // Swap the text for the editor.
    editor.hidden = false;
    actions.hidden = true; // Show only save and cancel while editing.
    editActions.hidden = false;
    editor.focus();

    const close = () => { // Restore the read-only view.
      body.hidden = false;
      editor.hidden = true;
      actions.hidden = false;
      editActions.hidden = true;
    };

    editActions.querySelector(".moderation-cancel").onclick = close; // Discard changes.
    editActions.querySelector(".moderation-save").onclick = async () => { // Save the corrected text.
      try {
        const result = await requestJson(`/api/comments/${commentId}`, {
          method: "PATCH",
          body: JSON.stringify({ body: editor.value })
        });
        applyCommentState(card, result.comment);
        showMessage("התגובה עודכנה.");
        close();
      } catch (error) {
        showMessage(error.message, true);
      }
    };
  };

  // Build one moderation card without inserting API text as HTML.
  const createCard = (comment) => {
    const card = document.createElement("article");
    card.className = "moderation-item";
    card.dataset.commentId = comment.id;

    const header = document.createElement("header");
    header.className = "moderation-item-header";

    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = comment.guestName;
    const meta = document.createElement("span");
    meta.className = "moderation-meta";
    meta.textContent = formatDate(comment.createdAt);
    identity.append(name, meta);

    const visibility = document.createElement("span");
    visibility.className = "status-pill moderation-visibility";
    header.append(identity, visibility);

    const articleLink = document.createElement("a");
    articleLink.className = "moderation-article";
    articleLink.href = `/articles/${comment.article.id}`;
    articleLink.target = "_blank";
    articleLink.rel = "noopener";
    articleLink.textContent = `בכתבה: ${comment.article.title}`;

    const body = document.createElement("p");
    body.className = "moderation-body";

    const editor = document.createElement("textarea");
    editor.className = "moderation-editor";
    editor.maxLength = 2000;
    editor.rows = 4;
    editor.hidden = true;

    const actions = document.createElement("div");
    actions.className = "moderation-actions";
    const editButton = createButton("עריכה", "button-secondary moderation-edit", () => startEditing(card, comment.id));
    const toggleButton = createButton("", "button-danger moderation-toggle", () => toggleVisibility(card, comment.id));
    actions.append(editButton, toggleButton);

    const editActions = document.createElement("div");
    editActions.className = "moderation-actions moderation-edit-actions";
    editActions.hidden = true;
    editActions.append(
      createButton("שמירה", "button-primary moderation-save", () => {}),
      createButton("ביטול", "button-secondary moderation-cancel", () => {})
    );

    card.append(header, articleLink, body, editor, actions, editActions);
    applyCommentState(card, comment); // Fill the state-dependent parts once.
    return card;
  };

  // Show a clear empty state instead of a blank panel.
  const renderEmpty = () => {
    elements.list.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "loading-indicator";
    empty.textContent = "לא נמצאו תגובות מתאימות.";
    elements.list.append(empty);
  };

  // Load the first page or the next page of the queue without reloading the page.
  const loadQueue = async ({ append = false } = {}) => {
    const version = ++requestVersion; // Mark this request so a slower older one is ignored.
    const cursor = append ? nextCursor : null;

    if (!append) { // Show loading feedback only when the list restarts.
      elements.list.replaceChildren();
      const loading = document.createElement("p");
      loading.className = "loading-indicator";
      loading.textContent = "טוען תגובות...";
      elements.list.append(loading);
    }
    elements.loadMore.disabled = true;

    try {
      const result = await requestJson(getQueueUrl(cursor));
      if (version !== requestVersion) return; // Drop a stale response.

      if (!append) elements.list.replaceChildren(); // Remove the loading state.
      elements.total.textContent = String(result.total); // Show the total of the whole filtered result.

      if (result.items.length === 0 && !append) {
        renderEmpty();
      } else {
        for (const comment of result.items) elements.list.append(createCard(comment));
      }

      nextCursor = result.pagination.nextCursor; // Remember the continuation point.
      elements.loadMore.hidden = !result.pagination.hasMore; // Show the button only when more pages exist.
    } catch (error) {
      if (!append) renderEmpty();
      showMessage(error.message, true);
    } finally {
      elements.loadMore.disabled = false;
    }
  };

  // Reload the queue when the editor submits the filters.
  elements.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    showMessage("");
    loadQueue();
  });
  // Search while typing with a short delay so the server is not called on every key.
  elements.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadQueue(), 300);
  });
  // Reload immediately when the visibility filter changes.
  elements.status.addEventListener("change", () => loadQueue());
  // Restore the default filters and reload.
  elements.clear.addEventListener("click", () => {
    elements.search.value = "";
    elements.status.value = "visible";
    showMessage("");
    loadQueue();
  });
  // Append the next page after the last loaded comment.
  elements.loadMore.addEventListener("click", () => loadQueue({ append: true }));
  // Load the first queue page as soon as the page is ready.
  loadQueue();
})();
