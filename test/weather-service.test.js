// Load Node's built-in test runner without adding another dependency.
const test = require("node:test");
// Load strict assertions so cache behavior is checked exactly.
const assert = require("node:assert/strict");
// Load the weather service and cache reset helper.
const { getWeather, resetWeatherCache } = require("../src/services/weather.service");

// Create a successful fetch replacement that records external calls.
function createFetchRecorder(weather) {
  // Count how many times the external service would be contacted.
  let calls = 0;
  // Return both the replacement function and a safe counter reader.
  return {
    // Simulate the small part of the Fetch API used by the service.
    async fetchImpl() {
      // Record one simulated external request.
      calls += 1;
      // Return a successful response with the selected weather data.
      return {
        // Mark the simulated HTTP response as successful.
        ok: true,
        // Return the selected object when the service parses JSON.
        async json() { return weather; }
      };
    },
    // Return the latest number of simulated external calls.
    getCalls() { return calls; }
  };
}

// Verify that repeated requests reuse weather during the fifteen-minute window.
test("weather results are cached inside the configured window", async () => {
  // Start this test without cache data left by another test.
  resetWeatherCache();
  // Create a simulated successful weather response.
  const recorder = createFetchRecorder({ current: { temperature_2m: 24 } });
  // Request fresh weather at the start of the sample timeline.
  const first = await getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: recorder.fetchImpl, now: 1000, cacheTtlMs: 900000 });
  // Request weather again before the fifteen-minute cache expires.
  const second = await getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: recorder.fetchImpl, now: 2000, cacheTtlMs: 900000 });
  // Confirm that both callers receive the same weather data.
  assert.deepEqual(second, first);
  // Confirm that the external service was contacted only once.
  assert.equal(recorder.getCalls(), 1);
});

// Verify that expired cache data is refreshed from the external service.
test("weather cache refreshes after the configured window", async () => {
  // Start this test without cache data left by another test.
  resetWeatherCache();
  // Create a simulated successful weather response.
  const recorder = createFetchRecorder({ current: { temperature_2m: 25 } });
  // Fill the cache at the start of the sample timeline.
  await getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: recorder.fetchImpl, now: 1000, cacheTtlMs: 900000 });
  // Request weather after more than fifteen minutes have passed.
  await getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: recorder.fetchImpl, now: 901001, cacheTtlMs: 900000 });
  // Confirm that expiry caused a second external request.
  assert.equal(recorder.getCalls(), 2);
});

// Verify that an expired result is never shown after the freshness limit.
test("weather service rejects an expired fallback after a service failure", async () => {
  // Start this test without cache data left by another test.
  resetWeatherCache();
  // Create a successful response used to populate fallback data.
  const recorder = createFetchRecorder({ current: { temperature_2m: 26 } });
  // Store one successful result in the service cache.
  await getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: recorder.fetchImpl, now: 1000, cacheTtlMs: 10 });
  // Create a replacement fetch function that simulates a network failure.
  const failingFetch = async () => { throw new Error("Network unavailable"); };
  // Request weather after expiry while the external service is unavailable.
  const expiredRequest = getWeather({ serviceUrl: "https://example.com/weather", fetchImpl: failingFetch, now: 2000, cacheTtlMs: 10 });
  // Confirm that the service does not display data older than the allowed window.
  await assert.rejects(expiredRequest, /Network unavailable/);
});
