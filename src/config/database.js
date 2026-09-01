const mongoose = require("mongoose");
const config = require("./environment");
const logger = require("../utils/logger");

let databaseState = "not-configured";

async function connectDatabase() {
  if (!config.mongoUri) {
    databaseState = "not-configured";
    logger.warn("MONGODB_URI is not configured; running in UI-only scaffold mode");
    return false;
  }

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    databaseState = "connected";
    logger.info("MongoDB connection established");
    return true;
  } catch (error) {
    databaseState = "error";
    logger.error("MongoDB connection failed", { message: error.message });
    return false;
  }
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  databaseState = "disconnected";
}

function getDatabaseStatus() {
  return databaseState;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus
};
