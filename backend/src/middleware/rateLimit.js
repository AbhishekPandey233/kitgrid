const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis');
const env = require('../config/env');

const IP_FAILURE_WINDOW_SECONDS = 10 * 60;
const IP_FAILURE_THRESHOLD = 20;
const IP_BLOCK_SECONDS = 15 * 60;

const allowedIps = new Set(
  (env.allowedIps || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
);

function isAllowedIp(ip) {
  return allowedIps.has(ip);
}

function ipFailureKey(ip) {
  return `ip_fail:${ip}`;
}

function ipBlockKey(ip) {
  return `ip_block:${ip}`;
}

async function isIpBlocked(ip) {
  if (isAllowedIp(ip)) return false;
  return Boolean(await redisClient.get(ipBlockKey(ip)));
}

async function recordFailedLoginFromIp(ip) {
  if (isAllowedIp(ip)) return;

  const key = ipFailureKey(ip);
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, IP_FAILURE_WINDOW_SECONDS);
  }

  if (count >= IP_FAILURE_THRESHOLD) {
    await redisClient.set(ipBlockKey(ip), '1', { EX: IP_BLOCK_SECONDS });
  }
}

function makeRedisStore(prefix) {
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });
}

const strictAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:strict:'),
  message: { error: 'Too many requests, please try again later' },
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:global:'),
  message: { error: 'Too many requests, please try again later' },
});

module.exports = {
  strictAuthLimiter,
  globalLimiter,
  isAllowedIp,
  isIpBlocked,
  recordFailedLoginFromIp,
};
