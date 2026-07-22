const logger = require('../utils/logger');
const env = require('../config/env');

// Express only treats this as error-handling middleware if it has arity 4;
// `next` must stay even though it's never called.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;

  logger.error(err.message, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    status,
  });

  const body =
    status === 500 && env.nodeEnv === 'production'
      ? { error: 'Internal server error' }
      : { error: err.message, stack: err.stack };

  res.status(status).json(body);
}

module.exports = errorHandler;
