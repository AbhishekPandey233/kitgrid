const env = require('./config/env');
const redisClient = require('./config/redis');

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
