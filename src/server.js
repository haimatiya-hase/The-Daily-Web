// Load the HTTP server, application, settings, and database helpers.
const http = require("node:http");
const config = require("./config/environment");
const createApp = require("./app");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const logger = require("./utils/logger");

// Connect the database and start listening for requests.
async function startServer() {
  // Connect before accepting traffic so database-backed routes are ready.
  await connectDatabase();

  // Create the Express app separately from the network server.
  const app = createApp();
  // Use Node's HTTP server as the network wrapper around Express.
  const server = http.createServer(app);
  // Listen on the port selected in the environment configuration.
  server.listen(config.port, () => {
    logger.info("The Daily Web server is running", { port: config.port });
  });

  // Close resources cleanly when the process receives a stop signal.
  const shutdown = async (signal) => {
    // Record which operating-system signal started the shutdown.
    logger.info("Shutdown requested", { signal });
    server.close(async () => {
      // Close MongoDB only after existing HTTP connections finish.
      await disconnectDatabase();
      // End the process with a successful shutdown code.
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  // Log startup failures and let the process report a failed exit.
  logger.error("Server failed to start", { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
