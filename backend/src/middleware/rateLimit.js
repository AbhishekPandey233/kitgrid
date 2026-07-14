const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis');
const env = require('../config/env');

const IP_FAILURE_WINDOW_SECONDS = 10 * 60; // count failed logins over a 10 min window
const IP_FAILURE_THRESHOLD = 20; // ...across ANY account from that IP
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

// Call on every failed login attempt regardless of whether the target account exists —
// this is IP-level brute-force protection, independent of the per-account lockout below.
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

// Strict limiter for authentication and other sensitive endpoints (login, register, and
// later MFA verification, password reset, WebAuthn challenge) — exported so those later
// phases can apply it the same way instead of each rolling their own.
const strictAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('rl:strict:'),
  message: { error: 'Too many requests, please try again later' },
});

// Looser ceiling applied to everything else.
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
