// Draw the Impact Analytics chart with Chart.js inside one private browser module.
(() => {
  const canvas = document.querySelector("#analytics-chart"); // Find the chart drawing surface.
  const statusText = document.querySelector("#analytics-status"); // Find the panel status message.
  const totalPill = document.querySelector("#analytics-total"); // Find the total views counter.
  const legend = document.querySelector("#analytics-legend"); // Find the marker explanation line.
  if (!canvas || !statusText) return; // Stop safely when the analytics panel is not on this page.

  const RANGES = [["24h", "24 שעות"], ["7d", "7 ימים"], ["30d", "30 ימים"], ["all", "הכול"]]; // Offer the same ranges the API accepts.
  const COLORS = { line: "#60f5d2", fill: "rgba(96, 245, 210, 0.16)", grid: "rgba(148, 171, 219, 0.18)", text: "#9aa8c4", marker: "#ff78c8", markerText: "#ffb7dd" }; // Match the site palette.
  let articleId = null; // Remember which article is selected.
  let range = "7d"; // Start with one week of hourly detail.
  let chart = null; // Keep the live Chart.js instance so it can be replaced.
  let requestVersion = 0; // Identify and ignore stale responses.

  // Build the range buttons, the sized chart wrapper, and the impact table once.
  const controls = document.createElement("div");
  controls.className = "analytics-controls";
  for (const [value, label] of RANGES) { // Create one button per range.
    const button = document.createElement("button");
    button.type = "button";
    button.className = `analytics-range${value === range ? " active" : ""}`;
    button.dataset.range = value;
    button.textContent = label;
    button.addEventListener("click", () => { range = value; updateRangeButtons(); load(); }); // Reload the chart in the chosen range.
    controls.append(button);
  }
  statusText.after(controls); // Place the buttons under the status line.

  const wrap = document.createElement("div"); // Give Chart.js a container with a fixed height.
  wrap.className = "analytics-chart-wrap";
  canvas.replaceWith(wrap);
  wrap.append(canvas);
  canvas.removeAttribute("width"); // Let Chart.js size the canvas to the wrapper.
  canvas.removeAttribute("height");
  canvas.hidden = false; // The wrapper now controls visibility; the template's hidden attribute must not keep the canvas at zero size.
  wrap.hidden = true; // Start hidden until an article is selected.

  const impact = document.createElement("div"); // Hold the before/after table under the chart.
  impact.className = "analytics-impact";
  impact.hidden = true;
  (legend || wrap).after(impact);

  // Highlight the active range button.
  const updateRangeButtons = () => {
    for (const button of controls.querySelectorAll(".analytics-range")) button.classList.toggle("active", button.dataset.range === range);
  };

  // Load the Chart.js build served by the server only when the chart is first needed.
  const loadChartLibrary = () => new Promise((resolve, reject) => {
    if (window.Chart) { resolve(window.Chart); return; } // Reuse the library when it is already loaded.
    const script = document.createElement("script");
    script.src = "/vendor/chart.js/chart.umd.js";
    script.onload = () => resolve(window.Chart);
    script.onerror = () => reject(new Error("ספריית הגרפים לא נטענה."));
    document.head.append(script);
  });

  // Format a timestamp for axis ticks depending on the resolution.
  const formatTick = (ms, resolution) => new Intl.DateTimeFormat("he-IL", resolution === "hour"
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit" }).format(new Date(ms));

  // Format a timestamp fully for tooltips and the impact table.
  const formatFull = (value) => new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

  // Draw a dashed labeled line at every publication that falls inside the drawn window.
  const markerPlugin = {
    id: "publicationMarkers",
    afterDatasetsDraw(instance, args, options) {
      const { ctx, chartArea, scales } = instance;
      for (const marker of options.markers || []) { // Draw only markers inside the window.
        if (!marker.inRange) continue;
        const x = scales.x.getPixelForValue(Date.parse(marker.publishedAt));
        if (x < chartArea.left || x > chartArea.right) continue;
        ctx.save();
        ctx.strokeStyle = COLORS.marker;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.markerText;
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(marker.versionNumber > 1 ? `עדכון ${marker.versionNumber - 1} (v${marker.versionNumber})` : "פרסום", x, chartArea.top - 6); // Name the first publication and every update.
        ctx.restore();
      }
    }
  };

  // Replace the chart with a new one drawn from the API response.
  const render = (Chart, data) => {
    if (chart) chart.destroy(); // Free the previous chart before drawing the new one.
    const resolution = data.resolution;

    chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [{
          label: "צפיות",
          data: data.points.map((point) => ({ x: Date.parse(point.time), y: point.views })), // Use real timestamps on the x axis.
          borderColor: COLORS.line,
          backgroundColor: COLORS.fill,
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: resolution === "hour" ? 0 : 3, // Keep hourly lines clean and daily points visible.
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Draw immediately so the graph is complete even when the tab was in the background.
        parsing: false, // The data is already {x, y}.
        interaction: { mode: "nearest", axis: "x", intersect: false },
        layout: { padding: { top: 18 } }, // Leave room for the marker labels.
        scales: {
          x: {
            type: "linear",
            min: Date.parse(data.from),
            max: Date.parse(data.to),
            ticks: { color: COLORS.text, maxTicksLimit: 8, callback: (value) => formatTick(value, resolution) },
            grid: { color: COLORS.grid }
          },
          y: {
            beginAtZero: true,
            ticks: { color: COLORS.text, precision: 0 },
            grid: { color: COLORS.grid },
            title: { display: true, text: resolution === "hour" ? "צפיות לשעה" : "צפיות ליום", color: COLORS.text }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: true,
            textDirection: "rtl",
            callbacks: {
              title: (items) => formatFull(items[0].parsed.x),
              label: (item) => `${item.parsed.y} צפיות`
            }
          },
          publicationMarkers: { markers: data.markers }
        }
      },
      plugins: [markerPlugin]
    });
  };

  // Fill the before/after table so the impact of every update is stated in numbers.
  const renderImpact = (markers) => {
    impact.replaceChildren();
    const updates = markers.filter((marker) => marker.versionNumber > 1); // The first publication has nothing before it.
    if (updates.length === 0) { impact.hidden = true; return; }

    const table = document.createElement("table");
    table.className = "stats-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const text of ["עדכון", "מועד הפרסום", "24 שעות לפני", "24 שעות אחרי", "שינוי"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = text;
      headRow.append(th);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const marker of updates) {
      const row = document.createElement("tr");
      const cells = [
        `עדכון ${marker.versionNumber - 1} (v${marker.versionNumber})`,
        formatFull(marker.publishedAt),
        String(marker.viewsBefore),
        String(marker.viewsAfter),
        marker.changePercent === null ? "—" : `${marker.changePercent > 0 ? "+" : ""}${marker.changePercent}%`
      ];
      cells.forEach((text, index) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (index === 4 && marker.changePercent !== null) td.className = marker.changePercent >= 0 ? "impact-up" : "impact-down"; // Color the direction of the change.
        row.append(td);
      });
      body.append(row);
    }
    table.append(head, body);
    impact.append(table);
    impact.hidden = false;
  };

  // Show a panel message and hide the chart when there is nothing to draw.
  const showEmptyState = (text) => {
    statusText.textContent = text;
    wrap.hidden = true;
    impact.hidden = true;
    if (legend) legend.hidden = true;
  };

  // Load and draw the analytics of the selected article in the selected range.
  const load = async () => {
    if (!articleId) return; // Wait for a selection.
    const version = ++requestVersion; // Mark this request so a slower older one is ignored.
    statusText.textContent = "טוען נתוני צפיות..."; // Give immediate feedback while the request runs.

    try {
      const [Chart, response] = await Promise.all([
        loadChartLibrary(),
        fetch(`/api/analytics/${articleId}?range=${encodeURIComponent(range)}`, { headers: { Accept: "application/json" } })
      ]);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || "טעינת הנתונים נכשלה.");
      if (version !== requestVersion) return; // Drop a stale response.

      if (totalPill) totalPill.textContent = `${result.article.totalViews} צפיות`; // Show the total counter of this article.

      if (result.summary.viewsInRange === 0 && !result.markers.some((marker) => marker.inRange)) { // Explain an empty window.
        showEmptyState("אין צפיות בטווח הזמן שנבחר. נסו טווח רחב יותר.");
        return;
      }

      wrap.hidden = false;
      if (legend) { legend.hidden = false; legend.textContent = `— ${result.resolution === "hour" ? "צפיות לשעה" : "צפיות ליום"} · | קו אנכי מסמן אישור ופרסום גרסה · ${result.summary.viewsInRange} צפיות בטווח`; }
      render(Chart, result);
      renderImpact(result.markers);
      statusText.textContent = `גרף צפיות עבור: ${result.article.title}`;
    } catch (error) {
      if (version === requestVersion) showEmptyState(error.message);
    }
  };

  // Redraw with fresh numbers when the browser restores this page from its back/forward cache.
  window.addEventListener("pageshow", (event) => { if (event.persisted) load(); });

  // Redraw whenever the page selects an article.
  document.addEventListener("editor:article-selected", (event) => {
    articleId = event.detail.articleId;
    load();
  });
})();
