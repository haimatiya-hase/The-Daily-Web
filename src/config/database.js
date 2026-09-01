// Load Mongoose and application settings.
const mongoose = require("mongoose");
const config = require("./environment");
const logger = require("../utils/logger");

// Store a small public status for the health endpoint.
let databaseState = "not-configured";

// Open the MongoDB connection when a URI exists.
async function connectDatabase() {
  // Allow the UI shell to run before local MongoDB setup is complete.
  if (!config.mongoUri) {
    databaseState = "not-configured";
    logger.warn("MONGODB_URI is not configured; running in UI-only scaffold mode");
    return false;
  }

  try {
    // Use a short timeout so the server does not hang during local setup.
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    databaseState = "connected";
    // Report success without printing the private connection string.
    logger.info("MongoDB connection established");
    return true;
  } catch (error) {
    // Keep the server available while exposing only a safe status to clients.
    databaseState = "error";
    logger.error("MongoDB connection failed", { message: error.message });
    return false;
  }
}

// Close the connection during a clean server shutdown.
async function disconnectDatabase() {
  // Mongoose state 0 means there is no open connection to close.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  databaseState = "disconnected";
}

// Return only the status, never connection credentials.
function getDatabaseStatus() {
  // Return the small status value used by the health endpoint.
  return databaseState;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus
};
