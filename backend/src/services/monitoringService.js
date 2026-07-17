const redisClient = require('../config/redis');
const SecurityAlert = require('../models/SecurityAlert');
const logger = require('../utils/logger');

const WINDOW_MS = 60 * 1000;
const ALERT_THRESHOLD = 5;
const ALERT_COOLDOWN_SECONDS = 5 * 60;

function windowKey(ip) {
  return `login_fail_window:${ip}`;
}

function cooldownKey(ip) {
  return `alert_cooldown:${ip}`;
}

async function recordFailedLoginForAlerting(ip) {
  if (!ip) return;

  const key = windowKey(ip);
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  await redisClient.zAdd(key, { score: now, value: member });
  await redisClient.zRemRangeByScore(key, 0, now - WINDOW_MS);
  await redisClient.expire(key, Math.ceil((WINDOW_MS / 1000) * 2));

  const count = await redisClient.zCard(key);
  if (count <= ALERT_THRESHOLD) return;

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
