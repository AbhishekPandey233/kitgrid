const env = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const redisClient = require('./config/redis');
const logger = require('./utils/logger');

async function start() {
  await connectDB();

  // Redis holds only ephemeral security state (rate limits, lockout counters, token
  // revocation lists) — connect in the background rather than blocking startup on it,
  // so a down/unreachable Redis degrades those specific features (fails closed) instead
  // of taking the whole API down. Errors are already logged via the client's 'error' handler.
  redisClient.connect().catch(() => {});

  app.listen(env.port, () => {
    logger.info(`KitGrid API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
