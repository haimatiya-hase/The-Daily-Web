// Load the HTTP server, application, settings, and database helpers.
const http = require("node:http");
const config = require("./config/environment");
const createApp = require("./app");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const logger = require("./utils/logger");

// Connect the database and start listening for requests.
async function startServer() {
  await connectDatabase();

  // Create the Express app separately from the network server.
  const app = createApp();
  const server = http.createServer(app);
  server.listen(config.port, () => {
    logger.info("The Daily Web server is running", { port: config.port });
  });

  // Close resources cleanly when the process receives a stop signal.
  const shutdown = async (signal) => {
    logger.info("Shutdown requested", { signal });
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  logger.error("Server failed to start", { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
