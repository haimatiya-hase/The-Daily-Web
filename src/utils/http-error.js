// Represent an expected HTTP error with its response status.
class HttpError extends Error {
  constructor(statusCode, message) {
    // Keep normal Error behavior so async middleware can handle this object.
    super(message);
    // Give the error a readable type for logs and debugging.
    this.name = "HttpError";
    // Store the HTTP status that the central handler should return.
    this.statusCode = statusCode;
  }
}

module.exports = HttpError;
