const redisClient = require('../config/redis');
const SecurityAlert = require('../models/SecurityAlert');
const logger = require('../utils/logger');

// Distinct from middleware/rateLimit.js's IP tracking (20 fails/10min -> 15min block, which
// is *enforcement*). This is a lower, faster threshold purely for admin *visibility* — it
// never blocks anything itself, it just flags a burst for a human to look at.
const WINDOW_MS = 60 * 1000; // 1 minute
const ALERT_THRESHOLD = 5; // more than 5 failures within the window
const ALERT_COOLDOWN_SECONDS = 5 * 60; // don't re-alert the same IP while one's still fresh

function windowKey(ip) {
  return `login_fail_window:${ip}`;
}

function cooldownKey(ip) {
  return `alert_cooldown:${ip}`;
}

// A genuine sliding window (a Redis sorted set scored by timestamp, pruned on every call) —
// not a fixed bucket that resets on a timer. "More than 5 in the last 60 seconds" is always
// evaluated relative to *now*, so a burst that straddles a bucket boundary can't slip
// through the way it could with a simple INCR+TTL counter.
async function recordFailedLoginForAlerting(ip) {
  if (!ip) return;

  const key = windowKey(ip);
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  await redisClient.zAdd(key, { score: now, value: member });
  await redisClient.zRemRangeByScore(key, 0, now - WINDOW_MS);
  await redisClient.expire(key, Math.ceil((WINDOW_MS / 1000) * 2)); // self-clean once the IP goes quiet

  const count = await redisClient.zCard(key);
  if (count <= ALERT_THRESHOLD) return;

  // Once the threshold is crossed, every further failure in the same burst would otherwise
  // raise its own duplicate alert — suppress re-alerting the same IP until the cooldown
  // lapses or an admin resolves it (see resolveAlert clearing this key too).
  const alreadyAlerted = await redisClient.get(cooldownKey(ip));
  if (alreadyAlerted) return;

  await redisClient.set(cooldownKey(ip), '1', { EX: ALERT_COOLDOWN_SECONDS });

  try {
    await SecurityAlert.create({
      type: 'brute_force_login',
      ip,
      details: `${count} failed logins from ${ip} within the last ${WINDOW_MS / 1000}s`,
    });
    logger.warn('Security alert raised: possible brute-force login burst', { ip, count });
  } catch (err) {
    logger.error('Failed to write security alert', { ip, error: err.message });
  }
}

async function clearAlertCooldown(ip) {
  await redisClient.del(cooldownKey(ip));
}

module.exports = { recordFailedLoginForAlerting, clearAlertCooldown };
