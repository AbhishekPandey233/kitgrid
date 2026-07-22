const fs = require('fs');
const https = require('https');
const env = require('./config/env');
const redisClient = require('./config/redis');

redisClient.connect().catch(() => {});

const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

async function start() {
  await connectDB();

  // env.tlsEnabled is only true when a real cert is mounted (see docker-compose.yml) — falls
  // back to plain HTTP otherwise (CI, native `npm run dev` without mkcert set up, etc.)
  // rather than requiring a cert everywhere.
  if (env.tlsEnabled) {
    const credentials = {
      key: fs.readFileSync(env.tlsKeyPath),
      cert: fs.readFileSync(env.tlsCertPath),
    };
    https.createServer(credentials, app).listen(env.port, () => {
      logger.info(`KitGrid API listening on port ${env.port} (HTTPS)`);
    });
  } else {
    app.listen(env.port, () => {
      logger.info(`KitGrid API listening on port ${env.port} (HTTP)`);
    });
  }
}

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
