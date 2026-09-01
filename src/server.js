const http = require("node:http");
const config = require("./config/environment");
const createApp = require("./app");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const logger = require("./utils/logger");

async function startServer() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  server.listen(config.port, () => {
    logger.info("The Daily Web server is running", { port: config.port });
  });

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
