// Draw the editor Impact Analytics chart inside one private browser module.
(() => {
  const canvas = document.querySelector("#analytics-chart"); // Find the chart drawing surface.
  const statusText = document.querySelector("#analytics-status"); // Find the panel status message.
  const totalPill = document.querySelector("#analytics-total"); // Find the total views counter.
  const legend = document.querySelector("#analytics-legend"); // Find the marker explanation line.
  if (!canvas || !statusText) return; // Stop safely when the analytics panel is not on this page.

  const chart2d = canvas.getContext("2d"); // Reuse one drawing context for every render.
  const DAY_MS = 24 * 60 * 60 * 1000; // Keep one day in milliseconds for axis math.

  // Match the site palette without reading CSS at draw time.
  const COLORS = {
    axis: "rgba(148, 171, 219, 0.35)", // Quiet axis and grid lines.
    text: "#9aa8c4", // Muted axis labels.
    line: "#60f5d2", // Accent color for the views line.
    fill: "rgba(96, 245, 210, 0.14)", // Soft area under the views line.
    marker: "#ff78c8", // Pink vertical lines for publication points.
    markerText: "#ffb7dd" // Readable labels above publication markers.
  };

  // Convert one YYYY-MM-DD day key into a UTC timestamp.
  const dayToTime = (day) => Date.parse(`${day}T00:00:00.000Z`);

  // Format one timestamp as a short numeric date for axis labels.
  const formatAxisDate = (time) => new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(new Date(time));

  // Fill missing days with zero so the line shows quiet days honestly.
  const buildDailySeries = (timeline, markers) => {
    const viewsByDay = new Map(); // Look up recorded totals by day key.
    for (const point of timeline) viewsByDay.set(point.day, point.views); // Index the aggregated API points.

    const times = timeline.map((point) => dayToTime(point.day)) // Collect every recorded day.
      .concat(markers.map((marker) => Date.parse(marker.publishedAt))) // Include marker days so publication points stay inside the axis.
      .filter((time) => Number.isFinite(time)); // Drop values that cannot become a date.
    if (times.length === 0) return []; // Report an empty series when there is nothing to draw.

    const firstDay = Math.floor(Math.min(...times) / DAY_MS) * DAY_MS; // Start the axis on the earliest involved day.
    const lastDay = Math.floor(Math.max(...times) / DAY_MS) * DAY_MS; // End the axis on the latest involved day.
    const series = []; // Collect one point per calendar day.

    for (let time = firstDay; time <= lastDay; time += DAY_MS) { // Walk the full day range without gaps.
      const dayKey = new Date(time).toISOString().slice(0, 10); // Rebuild the aggregation day key.
      series.push({ time, views: viewsByDay.get(dayKey) || 0 }); // Use zero views for days without events.
    }

    return series; // Return the gap-free chart series.
  };

  // Draw the axes, the daily views line, and the publication markers.
  const drawChart = (series, markers) => {
    const width = canvas.width; // Use the fixed drawing width.
    const height = canvas.height; // Use the fixed drawing height.
    const pad = { top: 30, left: 46, right: 16, bottom: 34 }; // Reserve space for labels around the plot.
    const plotWidth = width - pad.left - pad.right; // Compute the usable horizontal plot size.
    const plotHeight = height - pad.top - pad.bottom; // Compute the usable vertical plot size.

    const firstTime = series[0].time; // Read the axis start time.
    const lastTime = series[series.length - 1].time; // Read the axis end time.
    const timeSpan = Math.max(lastTime - firstTime, DAY_MS); // Avoid division by zero for one-day charts.
    const maxViews = Math.max(...series.map((point) => point.views), 1); // Scale the vertical axis to the busiest day.

    const xFor = (time) => pad.left + ((time - firstTime) / timeSpan) * plotWidth; // Map one timestamp onto the horizontal axis.
    const yFor = (views) => pad.top + plotHeight - (views / maxViews) * plotHeight; // Map one views value onto the vertical axis.

    chart2d.clearRect(0, 0, width, height); // Remove the previous article chart.
    chart2d.font = "11px system-ui"; // Keep axis labels small and readable.

    // Draw four horizontal grid lines with their view counts.
    for (let step = 0; step <= 4; step += 1) {
      const views = Math.round((maxViews / 4) * step); // Compute the value of this grid line.
      const y = yFor(views); // Position the line by its value.
      chart2d.strokeStyle = COLORS.axis; // Use the quiet grid color.
      chart2d.beginPath();
      chart2d.moveTo(pad.left, y);
      chart2d.lineTo(width - pad.right, y);
      chart2d.stroke();
      chart2d.fillStyle = COLORS.text; // Use the muted label color.
      chart2d.textAlign = "right"; // Keep numbers beside the axis.
      chart2d.fillText(String(views), pad.left - 8, y + 4); // Label the grid line.
    }

    // Draw up to six date labels along the time axis.
    const labelCount = Math.min(series.length, 6); // Avoid crowded overlapping labels.
    chart2d.textAlign = "center"; // Center each date under its position.
    for (let step = 0; step < labelCount; step += 1) {
      const point = series[Math.round((series.length - 1) * (step / Math.max(labelCount - 1, 1)))]; // Pick evenly spaced days.
      chart2d.fillStyle = COLORS.text;
      chart2d.fillText(formatAxisDate(point.time), xFor(point.time), height - 12); // Label the day below the plot.
    }

    // Fill the area under the line before drawing the line itself.
    chart2d.beginPath();
    chart2d.moveTo(xFor(series[0].time), yFor(0)); // Start the area on the baseline.
    for (const point of series) chart2d.lineTo(xFor(point.time), yFor(point.views)); // Follow the daily values.
    chart2d.lineTo(xFor(series[series.length - 1].time), yFor(0)); // Close the area on the baseline.
    chart2d.closePath();
    chart2d.fillStyle = COLORS.fill; // Use the soft accent fill.
    chart2d.fill();

    // Draw the daily views line above the filled area.
    chart2d.beginPath();
    for (const [index, point] of series.entries()) { // Connect every day on the axis.
      if (index === 0) chart2d.moveTo(xFor(point.time), yFor(point.views)); // Start at the first day.
      else chart2d.lineTo(xFor(point.time), yFor(point.views)); // Continue through each next day.
    }
    chart2d.strokeStyle = COLORS.line; // Use the accent line color.
    chart2d.lineWidth = 2; // Keep the line clearly visible.
    chart2d.stroke();
    chart2d.lineWidth = 1; // Restore the default width for other shapes.

    // Draw a small point on every day that recorded views.
    chart2d.fillStyle = COLORS.line;
    for (const point of series) {
      if (point.views === 0) continue; // Keep zero days as a plain line.
      chart2d.beginPath();
      chart2d.arc(xFor(point.time), yFor(point.views), 3, 0, Math.PI * 2); // Mark the recorded value.
      chart2d.fill();
    }

    // Mark every editor publication so views before and after an update are comparable.
    for (const marker of markers) {
      const time = Date.parse(marker.publishedAt); // Read the exact approval moment.
      if (!Number.isFinite(time)) continue; // Skip markers without a valid date.
      const x = Math.min(Math.max(xFor(time), pad.left), width - pad.right); // Keep the marker inside the plot.

      chart2d.strokeStyle = COLORS.marker; // Use the pink publication color.
      chart2d.setLineDash([5, 4]); // Make markers visually different from the views line.
      chart2d.beginPath();
      chart2d.moveTo(x, pad.top);
      chart2d.lineTo(x, pad.top + plotHeight);
      chart2d.stroke();
      chart2d.setLineDash([]); // Restore solid lines for the next shapes.

      chart2d.fillStyle = COLORS.markerText; // Use the readable marker label color.
      chart2d.textAlign = "center";
      const label = marker.versionNumber > 1 ? `עדכון ${marker.versionNumber}` : "פרסום"; // Name the first publication and every update.
      chart2d.fillText(label, x, pad.top - 8); // Place the label above the marker line.
    }
  };

  // Show a panel message and hide the chart when there is nothing to draw.
  const showEmptyState = (text) => {
    statusText.textContent = text; // Explain the current panel state.
    canvas.hidden = true; // Hide the stale chart surface.
    if (legend) legend.hidden = true; // Hide the legend with the chart.
  };

  // Load and draw the analytics of the article selected in the editor queue.
  document.addEventListener("editor:article-selected", async (event) => {
    const { articleId } = event.detail; // Read the selected article identifier.
    statusText.textContent = "טוען נתוני צפיות..."; // Give immediate feedback while the request runs.

    try { // Handle request failures without breaking the editor page.
      const response = await fetch(`/api/editor/articles/${articleId}/analytics`, { headers: { Accept: "application/json" } }); // Ask the protected analytics endpoint.
      const result = await response.json().catch(() => ({})); // Read the JSON body even on errors.
      if (!response.ok) throw new Error(result.error?.message || "טעינת הנתונים נכשלה."); // Convert API errors into one visible message.

      if (totalPill) totalPill.textContent = `${result.article.totalViews} צפיות`; // Show the total counter of this article.

      const series = buildDailySeries(result.timeline || [], result.markers || []); // Build the gap-free daily series.
      if (series.length === 0) { // Explain when the article has no recorded views yet.
        showEmptyState("אין עדיין נתוני צפייה לכתבה הזאת.");
        return;
      }

      canvas.hidden = false; // Reveal the chart surface before drawing.
      if (legend) legend.hidden = false; // Show the marker explanation with the chart.
      drawChart(series, result.markers || []); // Draw the views line and the publication markers.
      statusText.textContent = `גרף צפיות עבור: ${result.article.title}`; // Name the article shown by the chart.
    } catch (error) { // Show a safe error while keeping the rest of the dashboard usable.
      showEmptyState(error.message);
    }
  });
})();
