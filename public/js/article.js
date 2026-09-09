// Run the public article page behavior inside one private browser module.
(() => {
  const page = document.querySelector("#article-page"); // Find the server-rendered article root.
  if (!page) return; // Stop safely when the page rendered an error instead of an article.

  const articleId = page.dataset.articleId; // Read the identifier used by the comment and view APIs.
  const form = document.querySelector("#comment-form"); // Find the AJAX comment form.
  const nameInput = document.querySelector("#comment-name"); // Find the guest name field.
  const bodyInput = document.querySelector("#comment-body"); // Find the comment text field.
  const submitButton = document.querySelector("#comment-submit"); // Find the send button.
  const message = document.querySelector("#comment-message"); // Find the feedback message area.
  const commentsList = document.querySelector("#comments-list"); // Find the rendered comment list.
  const commentsCount = document.querySelector("#comments-count"); // Find the live comment counter.

  // Reuse the same anonymous browser key that the home feed stores.
  const getClientKey = () => { // Return one reusable anonymous key for this browser.
    const storageKey = "dailyWebClientKey"; // Share the storage name with the home feed script.

    try { // Recover safely when browser storage is unavailable.
      let value = localStorage.getItem(storageKey); // Reuse the key from an earlier visit.
      if (!value) { // Create a key only on the first visit.
        value = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; // Prefer a secure browser UUID with a simple fallback.
        localStorage.setItem(storageKey, value); // Save the key for later visits.
      }
      return value; // Return the existing or newly created browser key.
    } catch (error) { // Handle private browsing or blocked storage.
      return ""; // Let the server fall back to a network identifier.
    }
  };

  const clientKey = getClientKey(); // Read the anonymous key once for all requests.

  // Build the request headers shared by the view beacon and the comment form.
  const buildHeaders = () => {
    const headers = { Accept: "application/json", "Content-Type": "application/json" }; // Use JSON for both directions.
    if (clientKey) headers["X-Client-Key"] = clientKey; // Send the anonymous device key when storage is available.
    return headers; // Return the finished header object.
  };

  // Format one comment time exactly like the server-rendered comments.
  const formatCommentDate = (value) => {
    const date = new Date(value); // Convert the API value into a browser date.
    if (Number.isNaN(date.getTime())) return ""; // Hide invalid dates instead of showing broken text.
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(date); // Return a short Hebrew date and time.
  };

  // Build one safe comment element without inserting API text as HTML.
  const createCommentNode = (comment) => {
    const item = document.createElement("article"); // Create the semantic comment wrapper.
    item.className = "comment-item"; // Match the server-rendered comment design.

    const header = document.createElement("header"); // Group the commenter name and time.
    header.className = "comment-item-header";

    const name = document.createElement("strong"); // Show the guest name safely.
    name.textContent = comment.guestName;

    const time = document.createElement("time"); // Show when the comment was created.
    time.dateTime = new Date(comment.createdAt).toISOString();
    time.textContent = formatCommentDate(comment.createdAt);

    const body = document.createElement("p"); // Show the comment text safely.
    body.textContent = comment.body;

    header.append(name, time); // Assemble the comment header.
    item.append(header, body); // Assemble the full comment element.
    return item; // Return the finished node for the list.
  };

  // Show short feedback under the form without inserting HTML.
  const showMessage = (text, isError = false) => {
    message.textContent = text; // Replace the previous feedback text.
    message.classList.toggle("is-error", isError); // Color validation and rate-limit errors.
    message.classList.toggle("is-success", !isError && Boolean(text)); // Color the success confirmation.
  };

  // Count this visit for the view statistics without blocking the page.
  fetch(`/api/articles/${articleId}/views`, { method: "POST", headers: buildHeaders() })
    .catch(() => {}); // Ignore beacon failures because reading must keep working.

  // Send a new comment through AJAX and show it immediately in the list.
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Stop the browser from reloading the page.

    const guestName = nameInput.value.trim(); // Read the trimmed guest name.
    const body = bodyInput.value.trim(); // Read the trimmed comment text.

    if (!guestName || !body) { // Check both fields before contacting the server.
      showMessage("יש למלא שם ותגובה לפני השליחה.", true); // Explain what is missing.
      return; // Keep the typed values for correction.
    }

    submitButton.disabled = true; // Prevent double submissions while the request runs.

    try { // Handle validation, rate-limit, and network errors in one place.
      const response = await fetch(`/api/articles/${articleId}/comments`, {
        method: "POST", // Create the comment through the REST API.
        headers: buildHeaders(), // Include the anonymous device key for the server-side limit.
        body: JSON.stringify({ guestName, body }) // Send only the two allowed fields.
      });
      const result = await response.json().catch(() => ({})); // Read the JSON body even on errors.

      if (!response.ok) { // Convert API errors, including the 429 limit, into one visible message.
        throw new Error(result.error?.message || "שליחת התגובה נכשלה. נסו שוב.");
      }

      document.querySelector("#comments-empty")?.remove(); // Remove the empty state before the first comment appears.
      commentsList.prepend(createCommentNode(result.comment)); // Show the stored comment immediately without reloading the list.
      commentsCount.textContent = String(Number(commentsCount.textContent || 0) + 1); // Update the visible counter.
      bodyInput.value = ""; // Clear only the text so the guest can comment again easily.
      showMessage("התגובה פורסמה."); // Confirm the successful save.
    } catch (error) { // Show the server explanation for any failed attempt.
      showMessage(error.message, true);
    } finally { // Always allow the next submission attempt.
      submitButton.disabled = false;
    }
  });
})();
