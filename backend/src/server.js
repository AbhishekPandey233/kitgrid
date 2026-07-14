const env = require('./config/env');
const redisClient = require('./config/redis');

// Kick off the Redis connection before app.js is required: app.js builds rate-limit-redis
// stores at module-load time, which issue a command as soon as they're constructed.
// node-redis queues commands issued after connect() has been called (even before it
// resolves) but throws immediately if connect() was never called at all — so this has to
// happen first. Not awaited: Redis holds only ephemeral security state (rate limits,
// lockout counters, token revocation lists), so a down/unreachable Redis should degrade
// those specific features (fails closed) instead of blocking the whole API from starting.
// Errors are already logged via the client's own 'error' handler.
redisClient.connect().catch(() => {});

const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

async function start() {
  await connectDB();

  app.listen(env.port, () => {
    logger.info(`KitGrid API listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
