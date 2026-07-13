const { createClient } = require('redis');
const env = require('./env');
const logger = require('../utils/logger');

const redisClient = createClient({ url: env.redisUrl });

redisClient.on('error', (err) => logger.error(`Redis client error: ${err.message}`));
redisClient.on('connect', () => logger.info('Redis connected'));

module.exports = redisClient;
