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
  const loadMoreButton = document.querySelector("#comments-load-more"); // Find the load-more control.
  const loadMessage = document.querySelector("#comments-load-message"); // Find the load-more feedback area.
  let isLoadingMore = false; // Prevent two load-more requests from running together.

  // Read the device cookie that the server used when it counted this visit.
  const readDeviceCookie = () => { // Return the anonymous device key sent by the server, or an empty string.
    const prefix = "dailyWebDeviceKey="; // Match the cookie name used by the server.
    const part = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix)); // Find the device cookie.
    try { // Decode safely in case the value was encoded.
      return part ? decodeURIComponent(part.slice(prefix.length)) : ""; // Return the cookie value without its name.
    } catch (error) { // Ignore a malformed cookie value.
      return "";
    }
  };

  // Keep one anonymous key shared by the server count, the comment limit, and the home feed's viewed filter.
  const getClientKey = () => { // Return the device key, storing it where the home feed script reads it.
    const storageKey = "dailyWebClientKey"; // Share the storage name with the home feed script.
    const cookieKey = readDeviceCookie(); // Prefer the key the server counted this visit under.

    try { // Recover safely when browser storage is unavailable.
      if (cookieKey) { // Sync the server key so the feed's viewed filter matches the recorded views.
        if (localStorage.getItem(storageKey) !== cookieKey) localStorage.setItem(storageKey, cookieKey);
        return cookieKey;
      }
      let value = localStorage.getItem(storageKey); // Fall back to the key from an earlier visit.
      if (!value) { // Create a key only when neither the cookie nor storage has one.
        value = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; // Prefer a secure browser UUID with a simple fallback.
        localStorage.setItem(storageKey, value); // Save the key for later visits.
      }
      return value; // Return the existing or newly created browser key.
    } catch (error) { // Handle private browsing or blocked storage.
      return cookieKey; // The cookie alone still identifies the device for the server.
    }
  };

  const clientKey = getClientKey(); // Read the anonymous key once for all requests.

  // Build the request headers shared by the view beacon and the comment requests.
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

  // Show short feedback in one message element without inserting HTML.
  const showMessage = (target, text, isError = false) => {
    target.textContent = text; // Replace the previous feedback text.
    target.classList.toggle("is-error", isError); // Color validation, rate-limit, and network errors.
    target.classList.toggle("is-success", !isError && Boolean(text)); // Color the success confirmation.
  };

  // Send a new comment through AJAX and show it immediately in the list.
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Stop the browser from reloading the page.

    const guestName = nameInput.value.trim(); // Read the trimmed guest name.
    const body = bodyInput.value.trim(); // Read the trimmed comment text.

    if (!guestName || !body) { // Check both fields before contacting the server.
      showMessage(message, "יש למלא שם ותגובה לפני השליחה.", true); // Explain what is missing.
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
      showMessage(message, "התגובה פורסמה."); // Confirm the successful save.
    } catch (error) { // Show the server explanation for any failed attempt.
      showMessage(message, error.message, true);
    } finally { // Always allow the next submission attempt.
      submitButton.disabled = false;
    }
  });

  // Load the next page of older comments after the last rendered one.
  loadMoreButton?.addEventListener("click", async () => {
    const cursor = loadMoreButton.dataset.nextCursor; // Read the cursor left by the server or the previous page.
    if (!cursor || isLoadingMore) return; // Stop when there is nothing more to load or a request is already running.

    isLoadingMore = true; // Block a second click while this page loads.
    loadMoreButton.disabled = true; // Show the user that the request is running.
    showMessage(loadMessage, ""); // Clear an older error message.

    try { // Handle network and API failures without losing the loaded comments.
      const response = await fetch(`/api/articles/${articleId}/comments?cursor=${encodeURIComponent(cursor)}`, {
        headers: { Accept: "application/json" } // Ask for JSON explicitly.
      });
      const result = await response.json().catch(() => ({})); // Read the JSON body even on errors.

      if (!response.ok) { // Convert API errors into one visible message.
        throw new Error(result.error?.message || "טעינת התגובות נכשלה. נסו שוב.");
      }

      for (const comment of result.comments) { // Append older comments below the ones already shown.
        commentsList.append(createCommentNode(comment));
      }

      loadMoreButton.dataset.nextCursor = result.pagination.nextCursor || ""; // Remember where the next page starts.
      loadMoreButton.hidden = !result.pagination.hasMore; // Hide the button on the final page.
    } catch (error) { // Keep the button so the user can retry.
      showMessage(loadMessage, error.message, true);
    } finally { // Always allow the next load-more attempt.
      isLoadingMore = false;
      loadMoreButton.disabled = false;
    }
  });
})();
