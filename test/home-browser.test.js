const test = require("node:test"); // Load the built-in test runner.
const assert = require("node:assert/strict"); // Stop a test when a result is wrong.
const { readFileSync } = require("node:fs"); // Read the real home-page script.
const { join } = require("node:path"); // Build a path that works on each computer.
const { runInNewContext } = require("node:vm"); // Run browser code with small test objects.
const homeScript = readFileSync(join(__dirname, "../public/js/home.js"), "utf8"); // Test the actual script, not a copied version.

// These objects test DOM changes and request order, not real browser layout.
class TestElement { // Provide only the element features used by the home script.
  constructor(tagName = "div", name = "") { // Create a small in-memory element.
    this.tagName = tagName; // Keep the tag for simple selectors.
    this.name = name; // Keep a form control's name.
    this.value = ""; // Start controls with an empty value.
    this.className = ""; // Store CSS class names.
    this.children = []; // Store child elements in display order.
    this.attributes = {}; // Record accessibility attributes.
    this.style = {}; // Record inline height changes.
    this.listeners = {}; // Store callbacks for simulated user actions.
    this.top = 180; // Put the feed below the filter bar in the test viewport.
    this.classList = { add: (name) => { this.className += ` ${name}`; } }; // Support cards without an image.
  }

  append(...children) { this.children.push(...children); } // Add new cards without removing old cards.
  replaceChildren(...children) { this.children = children; } // Record a complete content replacement.
  setAttribute(name, value) { this.attributes[name] = value; } // Save an accessibility value.
  getBoundingClientRect() { return { top: this.top }; } // Return the configured position for height calculations.
  addEventListener(type, callback) { this.listeners[type] = callback; } // Remember a user-action handler.
  fire(type, event = {}) { this.listeners[type]?.(event); } // Run a real handler with a test event.
  focus(options) { this.focusOptions = options; } // Record whether focusing may move the page.

  matches(selector) { // Match the simple selectors used by the real script.
    return selector.split(",").some((part) => { // Check each selector in a comma-separated list.
      const item = part.trim(); // Remove spaces around a selector.
      if (item.startsWith(".")) return this.className.split(" ").includes(item.slice(1)); // Match a CSS class.
      return item === this.tagName || item === `${this.tagName}[name="${this.name}"]`; // Match a tag or named control.
    });
  }

  querySelector(selector) { // Find the first matching child or descendant.
    for (const child of this.children) { // Search children in display order.
      if (child.matches(selector)) return child; // Return a direct match.
      const nested = child.querySelector(selector); // Look inside this child's content.
      if (nested) return nested; // Return a nested match.
    }
    return null; // Match the browser when no element is found.
  }
}

function createPage() { // Start the real home script without a server or database.
  const ids = ["feed-filters", "feed", "feed-loading", "feed-sentinel", "feed-end", "feed-count", "feed-retry", "feed-retry-message", "feed-retry-button", "feed-clear"]; // Include the feed controls, but skip weather.
  const elements = Object.fromEntries(ids.map((id) => [id, new TestElement()])); // Create the visible feed elements.
  const controls = Object.fromEntries(["search", "category", "viewStatus", "sort"].map((name) => [name, new TestElement(name === "search" ? "input" : "select", name)])); // Create the four filter inputs.
  const form = elements["feed-filters"]; // Keep the form for dispatching actions.
  form.append(...Object.values(controls)); // Let the real script find its input elements.
  form.reset = () => { Object.values(controls).forEach((control) => { control.value = control.name === "sort" ? "publishedAt" : ""; }); }; // Restore the same defaults as the HTML form.
  form.reset(); // Start with the normal home-page choices.
  const requests = []; // Hold pending requests so tests can choose their response order.
  const storage = new Map(); // Keep the anonymous browser key in memory.
  const timers = new Map(); // Save search delays without waiting for real time.
  let timerId = 0; // Give each scheduled search its own ID.
  let onIntersection; // Save the infinite-scroll callback.
  class TestObserver { // Provide a controllable replacement for IntersectionObserver.
    constructor(callback) { onIntersection = callback; } // Remember the real scroll handler.
    observe() {} // Avoid triggering extra pages until the test asks.
  }
  const context = { // Provide only the browser features needed by this script.
    document: { cookie: "dailyWebDeviceKey=test-browser", querySelector: (selector) => elements[selector.slice(1)] || null, createElement: (tag) => new TestElement(tag) }, // Use safe in-memory elements and a test cookie.
    window: { innerHeight: 900, IntersectionObserver: TestObserver }, // Set a known screen height for the reserved-space check.
    IntersectionObserver: TestObserver, // Allow the script to create its scroll observer.
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) }, // Keep client-key behavior working.
    URLSearchParams, // Use the real query-string builder.
    AbortController, // Use real request-cancellation signals.
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, // Save a delayed search callback.
    clearTimeout(id) { timers.delete(id); }, // Cancel an outdated typing delay.
    fetch(url, options) { return new Promise((resolve, reject) => { requests.push({ url, options, resolve, reject }); }); } // Let tests simulate slow, failed, or out-of-order responses.
  };
  runInNewContext(homeScript, context); // Attach the real event handlers and start the first request.
  return { // Return the controls used by the regression tests.
    elements, controls, requests, timers, // Expose visible state and pending work.
    change(name, value) { controls[name].value = value; form.fire("change", { target: controls[name] }); }, // Simulate a selected filter value.
    scrollToEnd() { onIntersection([{ isIntersecting: true }]); }, // Simulate reaching the infinite-scroll target.
    finishTyping() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); } // Run the remaining search delay once.
  };
}

function flushUpdates() { return new Promise((resolve) => setImmediate(resolve)); } // Wait for fetch and JSON promise callbacks.

async function reply(request, titles, nextCursor = null) { // Resolve one API call with a small public feed page.
  const articles = titles.map((title, index) => ({ id: `article-${index}`, title, publishedAt: "2026-10-21T08:00:00Z" })); // Supply enough approved fields to build real cards.
  request.resolve({ ok: true, json: async () => ({ articles, pagination: { nextCursor, hasMore: Boolean(nextCursor) } }) }); // Return the normal API response shape.
  await flushUpdates(); // Wait until the real script has updated the DOM.
}

function visibleTitles(page) { return page.elements.feed.children.map((card) => card.querySelector("a")?.textContent); } // Read titles from the generated cards.

for (const [name, value] of [["category", "תרבות"], ["viewStatus", "viewed"], ["sort", "popularity"]]) { // Cover every select control in the filter bar.
  test(`${name} keeps existing cards visible until replacement results arrive`, async () => { // Guard against the original page-height collapse.
    const page = createPage(); // Start the actual home-page script.
    await reply(page.requests[0], ["Old story", "Another story"]); // Show an existing result list.
    const oldCards = [...page.elements.feed.children]; // Remember the original DOM nodes.
    page.change(name, value); // Start a slow filter request.
    assert.deepEqual(page.elements.feed.children, oldCards); // Keep every old card while the response is pending.
    assert.equal(page.elements.feed.attributes["aria-busy"], "true"); // Mark the retained cards as updating.
    assert.equal(new URL(page.requests[1].url, "http://localhost").searchParams.get(name), value); // Send the chosen control to the API.
    await reply(page.requests[1], ["Matching story"]); // Finish the filter request.
    assert.deepEqual(visibleTitles(page), ["Matching story"]); // Replace the old query instead of appending to it.
    assert.equal(page.elements["feed-count"].textContent, "1 כתבות נטענו"); // Reset the count only after the new query succeeds.
    assert.equal(page.elements.feed.attributes["aria-busy"], "false"); // Finish the loading state.
    assert.equal(page.elements.feed.style.minHeight, "720px"); // Reserve only the visible screen space for a shorter result list.
  });
}

test("an empty filtered result still reserves the current viewport space", async () => { // Cover filters that return no matching articles.
  const page = createPage(); // Start a fresh home page.
  await reply(page.requests[0], ["Old story"]); // Load an initial card.
  page.elements.feed.top = -250; // Simulate a visitor who has scrolled into the feed.
  page.change("viewStatus", "unviewed"); // Request another view-state filter.
  await reply(page.requests[1], []); // Return no matching articles.
  assert.equal(page.elements.feed.style.minHeight, "1150px"); // Keep the document tall enough for the current scroll position.
  assert.equal(page.elements.feed.querySelector("h3").textContent, "לא נמצאו כתבות מתאימות"); // Explain the empty result.
  assert.equal(page.elements["feed-count"].textContent, "אין תוצאות"); // Clear the old article count.
  page.scrollToEnd(); // Simulate the visible bottom marker.
  assert.equal(page.requests.length, 2); // Do not load another page after an empty result.
});

test("rapid filter changes cancel old requests and ignore late responses", async () => { // Prevent a slower request from replacing newer choices.
  const page = createPage(); // Start the home page.
  await reply(page.requests[0], ["Old story"]); // Show the initial result.
  page.change("category", "תרבות"); // Begin the first filter request.
  page.change("category", "ספורט"); // Immediately choose a different category.
  assert.equal(page.requests[1].options.signal.aborted, true); // Ask the browser to cancel the obsolete request.
  await reply(page.requests[1], ["Late culture story"]); // Simulate a response already in flight despite cancellation.
  assert.deepEqual(visibleTitles(page), ["Old story"]); // Ignore stale cards while the latest query is pending.
  assert.equal(page.elements.feed.attributes["aria-busy"], "true"); // Do not let an older completion clear the new loading state.
  await reply(page.requests[2], ["Sports story"]); // Finish the most recent selection.
  assert.deepEqual(visibleTitles(page), ["Sports story"]); // Show only the latest filter result.
});

test("an aborted request cannot replace a newer successful result with an error", async () => { // Cover cancellation callbacks arriving out of order.
  const page = createPage(); // Leave the initial request pending.
  page.change("category", "כלכלה"); // Replace that request with a filtered one.
  await reply(page.requests[1], ["Economy story"]); // Finish the newest request first.
  page.requests[0].reject(new Error("Request aborted")); // Deliver the old cancellation afterwards.
  await flushUpdates(); // Let the obsolete error handler finish.
  assert.deepEqual(visibleTitles(page), ["Economy story"]); // Keep the new successful result.
  assert.equal(page.elements["feed-retry"].hidden, true); // Do not show an error for intentional cancellation.
});

test("a failed filter preserves cards and retry loads the new filters", async () => { // Keep usable content during a network failure.
  const page = createPage(); // Start a fresh page.
  await reply(page.requests[0], ["Old story"]); // Load an existing card.
  page.change("category", "טכנולוגיה"); // Start a replacement query.
  page.requests[1].reject(new Error("Offline")); // Simulate a temporary connection failure.
  await flushUpdates(); // Finish error handling.
  assert.deepEqual(visibleTitles(page), ["Old story"]); // Never remove the readable old card on failure.
  assert.match(page.elements["feed-count"].textContent, /התוצאות הקודמות/); // Clearly label the remaining cards as older results.
  assert.equal(page.elements["feed-retry"].hidden, false); // Offer a recovery action.
  page.scrollToEnd(); // Try automatic scrolling after the failure.
  assert.equal(page.requests.length, 2); // Pause automatic retry loops.
  page.elements["feed-retry-button"].fire("click"); // Retry with the visible recovery button.
  assert.equal(page.requests[2].url, page.requests[1].url); // Request the selected filter, not the old result query.
  await reply(page.requests[2], ["Technology story"]); // Complete the recovery.
  assert.deepEqual(visibleTitles(page), ["Technology story"]); // Replace the old result after a successful retry.
  assert.equal(page.elements["feed-retry"].hidden, true); // Clear the recovered error.
});

test("infinite scroll still appends cards and retries the same cursor", async () => { // Protect pagination while changing first-page replacement behavior.
  const page = createPage(); // Start the real feed script.
  await reply(page.requests[0], ["First story"], "page-two"); // Return a cursor for another page.
  const firstCard = page.elements.feed.children[0]; // Remember the first card's identity.
  page.scrollToEnd(); // Request the next result page.
  page.scrollToEnd(); // Trigger the observer again while that request is pending.
  assert.equal(page.requests.length, 2); // Never request a page twice at the same time.
  assert.equal(new URL(page.requests[1].url, "http://localhost").searchParams.get("cursor"), "page-two"); // Continue from the API cursor.
  page.requests[1].reject(new Error("Offline")); // Fail only the next-page request.
  await flushUpdates(); // Let the retry panel appear.
  assert.equal(page.elements.feed.children[0], firstCard); // Keep the earlier page after a pagination error.
  page.elements["feed-retry-button"].fire("click"); // Request the failed page again.
  assert.equal(page.requests[2].url, page.requests[1].url); // Reuse the exact failed cursor.
  await reply(page.requests[2], ["Second story"]); // Finish the last result page.
  assert.deepEqual(visibleTitles(page), ["First story", "Second story"]); // Append rather than replacing previous pages.
  assert.equal(page.elements["feed-count"].textContent, "2 כתבות נטענו"); // Count both pages together.
  assert.equal(page.elements["feed-end"].hidden, false); // Show that the query is complete.
});

test("search submission prevents navigation and clear focuses without scrolling", async () => { // Cover both buttons beside the select controls.
  const page = createPage(); // Start a fresh home page.
  await reply(page.requests[0], ["Old story"]); // Make current cards visible.
  page.controls.search.value = "  news  "; // Type text with surrounding spaces.
  let prevented = false; // Record whether normal form navigation was blocked.
  page.elements["feed-filters"].fire("submit", { preventDefault() { prevented = true; } }); // Run the actual search-submit handler.
  assert.equal(prevented, true); // Keep the visitor on the same page.
  assert.deepEqual(visibleTitles(page), ["Old story"]); // Keep cards during the search request.
  assert.equal(new URL(page.requests[1].url, "http://localhost").searchParams.get("search"), "news"); // Send the trimmed search term.
  await reply(page.requests[1], ["Search story"]); // Show the matching story.
  page.elements["feed-clear"].fire("click"); // Restore all default filters.
  assert.equal(page.controls.search.focusOptions.preventScroll, true); // Do not jump to the search field when restoring focus.
  assert.deepEqual(visibleTitles(page), ["Search story"]); // Keep cards while the default query loads.
  assert.equal(page.requests[2].url, "/api/articles?sort=publishedAt"); // Remove all active filters from the request.
  await reply(page.requests[2], ["Default story"]); // Complete the reset.
  assert.deepEqual(visibleTitles(page), ["Default story"]); // Show the default result list.
});

test("typing waits for the final search text without clearing cards", async () => { // Keep the short search delay working.
  const page = createPage(); // Start a fresh home page.
  await reply(page.requests[0], ["Old story"]); // Display an existing story.
  page.controls.search.value = "n"; // Begin typing a search.
  page.controls.search.fire("input"); // Schedule the first delayed request.
  page.controls.search.value = "news"; // Finish typing before the delay ends.
  page.controls.search.fire("input"); // Replace the earlier timer.
  assert.equal(page.timers.size, 1); // Keep only the latest typing delay.
  assert.equal(page.requests.length, 1); // Do not request a page for every keystroke.
  page.finishTyping(); // End the remaining delay.
  assert.deepEqual(visibleTitles(page), ["Old story"]); // Preserve cards while the delayed request is loading.
  assert.equal(new URL(page.requests[1].url, "http://localhost").searchParams.get("search"), "news"); // Search for the final text.
  await reply(page.requests[1], ["Search story"]); // Complete the delayed search.
});
