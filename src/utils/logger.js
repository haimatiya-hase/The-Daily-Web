// Write structured logs that are easy to search later.
function write(level, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };

  // Convert the log entry to one JSON line.
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = {
  // Log a normal event.
  info(message, metadata) {
    write("info", message, metadata);
  },
  // Log a recoverable problem.
  warn(message, metadata) {
    write("warn", message, metadata);
  },
  // Log a failure to standard error.
  error(message, metadata) {
    write("error", message, metadata);
  }
};
