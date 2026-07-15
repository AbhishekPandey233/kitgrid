// Lets a handler throw a specific status/message from deep inside a transaction callback
// (or any nested helper) and have the outer catch block turn it into the right response,
// instead of every layer needing its own res.status(...).json(...) branch.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
