// Find the controls that are available on the home page.
(() => {
  const filters = document.querySelector("#feed-filters");
  const healthLink = document.querySelector('a[href="/api/health"]');
  // Find the area that displays weather on the home page.
  const weatherContent = document.querySelector("#weather-content");

  // Convert standard weather codes into short Hebrew descriptions.
  function describeWeather(code) {
    // Describe clear and mainly clear conditions.
    if ([0, 1].includes(code)) return "בהיר";
    // Describe partly cloudy and overcast conditions.
    if ([2, 3].includes(code)) return "מעונן";
    // Describe fog conditions.
    if ([45, 48].includes(code)) return "ערפילי";
    // Describe drizzle and rain conditions.
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "גשום";
    // Describe snow conditions.
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "מושלג";
    // Describe thunderstorm conditions.
    if ([95, 96, 99].includes(code)) return "סופת רעמים";
    // Use a general description for an unfamiliar service code.
    return "מצב משתנה";
  }

  // Replace the loading message with a friendly unavailable state.
  function showWeatherUnavailable() {
    // Stop when the current page does not contain the weather widget.
    if (!weatherContent) return;
    // Show a safe message without exposing technical error details.
    weatherContent.innerHTML = '<p class="weather-status">נתוני מזג האוויר אינם זמינים כרגע.</p>';
  }

  // Request current weather from the local server API.
  async function loadWeather() {
    // Stop when the current page does not contain the weather widget.
    if (!weatherContent) return;

    // Handle network and server errors without affecting the rest of the page.
    try {
      // Ask the local API for its small cached weather response.
      const response = await fetch("/api/weather", { headers: { Accept: "application/json" } });
      // Parse the JSON body returned by the local API.
      const weather = await response.json();

      // Show the unavailable state for failed or incomplete responses.
      if (!response.ok || !weather.available || !Number.isFinite(weather.temperature)) {
        // Replace the loading message with the unavailable message.
        showWeatherUnavailable();
        // Stop before trying to display missing values.
        return;
      }

      // Convert the numeric service code into readable text.
      const description = describeWeather(weather.weatherCode);
      // Round the temperature so the compact card remains easy to scan.
      const temperature = Math.round(weather.temperature);
      // Display only values created by this script, not external HTML.
      weatherContent.innerHTML = `<strong class="weather-temperature">${temperature}°</strong><span class="weather-description">${description}</span>`;
    // Recover when the browser cannot reach or parse the local API.
    } catch (error) {
      // Replace the loading message with the unavailable message.
      showWeatherUnavailable();
    }
  }

  // Prevent a full page reload until the feed API is connected.
  filters?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  // Check the server asynchronously from the browser.
  healthLink?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
      const health = await response.json();
      window.alert(`שרת: ${health.ok ? "תקין" : "בעיה"}\nמסד נתונים: ${health.database}`);
    } catch (error) {
      window.alert("לא ניתן לקבל את מצב המערכת כרגע.");
    }
  });

  // Load weather after the page controls are ready.
  loadWeather();
})();
