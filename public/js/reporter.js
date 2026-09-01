(() => { // Keep reporter page variables out of the global browser scope.
  const createButton = document.querySelector("#new-article-button"); // Find the new article button on the dashboard.
  const dashboardMessage = document.querySelector("#reporter-message"); // Find the dashboard message area.
  const form = document.querySelector("#reporter-article-form"); // Find the article form on the editor page.
  const submitButton = document.querySelector("#submit-article-button"); // Find the submit-for-review button.
  const autosaveStatus = document.querySelector("#autosave-status"); // Find the live autosave message.

  async function readResponse(response) { // Read a JSON response without crashing on an unexpected HTML response.
    try { // Attempt to parse the normal API response.
      return await response.json(); // Return the parsed response object.
    } catch (error) { // Handle an invalid or empty response body.
      return { message: "השרת החזיר תשובה לא תקינה." }; // Return a clear generic message.
    }
  }

  createButton?.addEventListener("click", async () => { // Create a blank draft when the reporter clicks the dashboard button.
    createButton.disabled = true; // Prevent duplicate drafts while the request is running.
    if (dashboardMessage) dashboardMessage.textContent = "יוצר טיוטה חדשה..."; // Show immediate progress feedback.

    try { // Handle network failures without breaking the dashboard.
      const response = await fetch("/api/reporter/articles", { method: "POST", headers: { Accept: "application/json" } }); // Ask the REST API to create the draft.
      const result = await readResponse(response); // Read the new article URL or error message.
      if (!response.ok) throw new Error(result.message); // Turn an API problem into the normal error flow.
      window.location.assign(result.editUrl); // Open the new article in the reporter editor.
    } catch (error) { // Show create failures on the current page.
      if (dashboardMessage) dashboardMessage.textContent = error.message || "לא ניתן ליצור כתבה כרגע."; // Display a useful retry message.
      createButton.disabled = false; // Allow the reporter to try again.
    }
  });

  if (!form) return; // Stop when the current page is only the dashboard.

  const articleId = form.dataset.articleId; // Read the article ID stored by the EJS page.
  const editable = form.dataset.editable === "true"; // Read whether the current workflow state allows editing.
  let saveTimer = null; // Store the delayed autosave timer.
  let lastSavedPayload = JSON.stringify(getFormValues()); // Remember the version that was loaded from MongoDB.

  function getFormValues() { // Collect every editable article field from the form.
    const values = new FormData(form); // Read the named form controls.
    return { // Return a small JSON-ready object.
      title: values.get("title") || "", // Read the article title.
      summary: values.get("summary") || "", // Read the article summary.
      category: values.get("category") || "", // Read the selected category.
      imageUrl: values.get("imageUrl") || "", // Read the main image address.
      content: values.get("content") || "" // Read the full article body.
    };
  }

  function showAutosaveMessage(message, isError = false) { // Update the accessible autosave message.
    if (!autosaveStatus) return; // Stop when the page has no status element.
    autosaveStatus.textContent = message; // Show the latest save state.
    autosaveStatus.classList.toggle("error-text", isError); // Highlight only error messages.
  }

  async function saveArticle() { // Save the latest form values with a REST update.
    const payload = JSON.stringify(getFormValues()); // Convert the current form into JSON.
    if (payload === lastSavedPayload) return true; // Skip the request when nothing changed.
    showAutosaveMessage("שומר..."); // Tell the reporter that autosave started.

    try { // Keep a network problem from interrupting typing.
      const response = await fetch(`/api/reporter/articles/${articleId}`, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: payload }); // Send the private working version to MongoDB.
      const result = await readResponse(response); // Read the save confirmation or validation problem.
      if (!response.ok) throw new Error(result.message); // Move an API problem into the normal error flow.
      lastSavedPayload = payload; // Remember exactly which version reached the server.
      const savedTime = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()); // Format the current save time.
      showAutosaveMessage(`נשמר אוטומטית בשעה ${savedTime}`); // Confirm that the draft is stored.
      return true; // Tell submission logic that saving succeeded.
    } catch (error) { // Show a retry message when autosave fails.
      showAutosaveMessage(error.message || "השמירה נכשלה. השינוי יישמר בניסיון הבא.", true); // Keep the reporter informed without clearing the form.
      return false; // Tell submission logic not to continue.
    }
  }

  function queueAutosave() { // Delay saving until the reporter pauses typing.
    window.clearTimeout(saveTimer); // Cancel the previous delay after another keystroke.
    showAutosaveMessage("ממתין לשמירה אוטומטית..."); // Show that the local change was detected.
    saveTimer = window.setTimeout(saveArticle, 800); // Save 800 milliseconds after the last change.
  }

  if (editable) form.addEventListener("input", queueAutosave); // Watch text changes only when editing is allowed.
  if (editable) form.addEventListener("change", queueAutosave); // Watch select changes only when editing is allowed.

  document.addEventListener("visibilitychange", () => { // Save when the reporter changes tabs or minimizes the browser.
    if (editable && document.visibilityState === "hidden") void saveArticle(); // Send the latest visible draft before the page may pause.
  });

  window.addEventListener("pagehide", () => { // Make a final small save request when the page closes.
    if (!editable) return; // Skip the request for read-only articles.
    const payload = JSON.stringify(getFormValues()); // Capture the final form values.
    if (payload === lastSavedPayload) return; // Skip the beacon when the latest version is already stored.
    const body = new Blob([payload], { type: "application/json" }); // Wrap the JSON in a sendBeacon-compatible body.
    navigator.sendBeacon(`/api/reporter/articles/${articleId}/autosave`, body); // Ask the browser to finish saving after navigation.
  });

  submitButton?.addEventListener("click", async () => { // Save and send the article to the editor.
    window.clearTimeout(saveTimer); // Stop a delayed autosave from racing with submission.
    submitButton.disabled = true; // Prevent duplicate submissions.
    const saved = await saveArticle(); // Store the latest form values before changing status.
    if (!saved) { // Stop when the latest version did not reach MongoDB.
      submitButton.disabled = false; // Allow the reporter to retry.
      return; // Keep the article in its editable state.
    }

    showAutosaveMessage("שולח לאישור עורך..."); // Show submission progress.

    try { // Handle workflow and network failures on the same page.
      const response = await fetch(`/api/reporter/articles/${articleId}/submit`, { method: "POST", headers: { Accept: "application/json" } }); // Ask the server to validate and submit the article.
      const result = await readResponse(response); // Read the confirmation or validation message.
      if (!response.ok) throw new Error(result.message); // Move an API problem into the normal error flow.
      window.location.assign("/reporter"); // Return to the dashboard after successful submission.
    } catch (error) { // Keep the article editable after a failed submission.
      showAutosaveMessage(error.message || "לא ניתן לשלוח את הכתבה כרגע.", true); // Display the exact validation or network problem.
      submitButton.disabled = false; // Allow another submission attempt.
    }
  });
})();
