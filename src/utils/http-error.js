// Represent an expected HTTP error with its response status.
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

module.exports = HttpError;
