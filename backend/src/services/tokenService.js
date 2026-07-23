const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const redisClient = require('../config/redis');

const ACCESS_TOKEN_TTL = '15d';
const ACCESS_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * 1000;
const MFA_PENDING_TOKEN_TTL = '5m';

function sessionKey(userId, sessionId) {
  return `session:${userId}:${sessionId}`;
}

const PASSWORD_RESET_TTL_SECONDS = 15 * 60;

function passwordResetKey(hashedToken) {
  return `password_reset:${hashedToken}`;
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function issuePasswordResetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await redisClient.set(passwordResetKey(hashResetToken(rawToken)), userId.toString(), {
    EX: PASSWORD_RESET_TTL_SECONDS,
  });
  return rawToken;
}

async function verifyPasswordResetToken(rawToken) {
  if (!rawToken) return null;
  return redisClient.get(passwordResetKey(hashResetToken(rawToken)));
}

async function consumePasswordResetToken(rawToken) {
  await redisClient.del(passwordResetKey(hashResetToken(rawToken)));
}

const OTP_TTL_SECONDS = 10 * 60;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function otpKey(email) {
  return `password_reset_otp:${email}`;
}

function otpCooldownKey(email) {
  return `password_reset_otp_cooldown:${email}`;
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

async function canIssuePasswordResetOtp(email) {
  return !(await redisClient.get(otpCooldownKey(email)));
}

async function issuePasswordResetOtp(email) {
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  await redisClient.set(otpKey(email), JSON.stringify({ hash: hashOtp(otp), attempts: 0 }), { EX: OTP_TTL_SECONDS });
  await redisClient.set(otpCooldownKey(email), '1', { EX: OTP_RESEND_COOLDOWN_SECONDS });
  return otp;
}

async function verifyPasswordResetOtp(email, submittedOtp) {
  const key = otpKey(email);
  const raw = await redisClient.get(key);
  if (!raw || typeof submittedOtp !== 'string') return false;

  let record;
  try {
    record = JSON.parse(raw);
  } catch (err) {
    await redisClient.del(key);
    return false;
  }

  const expected = Buffer.from(record.hash, 'hex');
  const submitted = Buffer.from(hashOtp(submittedOtp), 'hex');
  const matches = expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);

  if (matches) {
    await redisClient.del(key);
    return true;
  }

  record.attempts += 1;
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await redisClient.del(key);
  } else {
    const ttl = await redisClient.ttl(key);
    await redisClient.set(key, JSON.stringify(record), { EX: ttl > 0 ? ttl : OTP_TTL_SECONDS });
  }
  return false;
}

const WEBAUTHN_CHALLENGE_TTL_SECONDS = 5 * 60;

function webauthnChallengeKey(purpose, userId) {
  return `webauthn_challenge:${purpose}:${userId}`;
}

async function issueWebauthnChallenge(purpose, userId, challenge) {
  await redisClient.set(webauthnChallengeKey(purpose, userId), challenge, {
    EX: WEBAUTHN_CHALLENGE_TTL_SECONDS,
  });
}

async function consumeWebauthnChallenge(purpose, userId) {
  const key = webauthnChallengeKey(purpose, userId);
  const challenge = await redisClient.get(key);
  await redisClient.del(key);
  return challenge;
}

function computeFingerprint(userAgent, deviceId) {
  return crypto
    .createHash('sha256')
    .update(`${userAgent || ''}:${deviceId || ''}`)
    .digest('hex');
}

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, purpose: 'access' }, env.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken({ userId, sessionId, jti }) {
  return jwt.sign({ sub: userId, sid: sessionId, jti }, env.jwtRefreshSecret, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== 'access') {
    throw new Error('Invalid token purpose');
  }
  return payload;
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

function signMfaPendingToken(user) {
  return jwt.sign({ sub: user._id.toString(), purpose: 'mfa_pending' }, env.jwtSecret, {
    expiresIn: MFA_PENDING_TOKEN_TTL,
  });
}

function verifyMfaPendingToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== 'mfa_pending') {
    throw new Error('Invalid token purpose');
  }
  return payload;
}

async function issueSession(user, meta = {}) {
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    jti,
    fingerprint: meta.fingerprint || null,
    userAgent: meta.userAgent || null,
    createdAt: now,
    lastUsedAt: now,
  };

  await redisClient.set(sessionKey(user._id.toString(), sessionId), JSON.stringify(record), {
    EX: REFRESH_TOKEN_TTL_SECONDS,
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken({ userId: user._id.toString(), sessionId, jti }),
    sessionId,
  };
}

async function rotateSession({ userId, sessionId, jti }, user, meta = {}) {
  const key = sessionKey(userId, sessionId);
  const raw = await redisClient.get(key);
  if (!raw) {
    return null;
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch (err) {
    await redisClient.del(key);
    return null;
  }

  if (record.jti !== jti) {
    await redisClient.del(key);
    return null;
  }

  if (
    env.deviceBindingEnabled &&
    record.fingerprint &&
    meta.fingerprint &&
    record.fingerprint !== meta.fingerprint
  ) {
    await redisClient.del(key);
    return null;
  }

  const newJti = crypto.randomUUID();
  const updated = {
    ...record,
    jti: newJti,
    lastUsedAt: new Date().toISOString(),
  };
  await redisClient.set(key, JSON.stringify(updated), { EX: REFRESH_TOKEN_TTL_SECONDS });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken({ userId, sessionId, jti: newJti }),
  };
}

async function revokeSession(userId, sessionId) {
  await redisClient.del(sessionKey(userId, sessionId));
}

async function revokeAllSessions(userId) {
  const keys = await redisClient.keys(sessionKey(userId, '*'));
  await Promise.all(keys.map((key) => redisClient.del(key)));
}

async function listSessions(userId) {
  const keys = await redisClient.keys(sessionKey(userId, '*'));
  const sessions = [];

  for (const key of keys) {
    const raw = await redisClient.get(key);
    if (!raw) continue;

    let record;
    try {
      record = JSON.parse(raw);
    } catch (err) {
      continue;
    }

    sessions.push({
      sessionId: key.slice(key.lastIndexOf(':') + 1),
      userAgent: record.userAgent,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    });
  }

  return sessions;
}

function generateCsrfToken(sessionId) {
  return crypto.createHmac('sha256', env.csrfSecret).update(sessionId).digest('hex');
}

function verifyCsrfToken(sessionId, token) {
  if (!sessionId || !token || typeof token !== 'string') {
    return false;
  }

  const expected = Buffer.from(generateCsrfToken(sessionId), 'hex');
  const submitted = Buffer.from(token, 'hex');

  if (expected.length !== submitted.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, submitted);
}

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.nodeEnv === 'production' || env.tlsEnabled,
};

const accessCookieOptions = {
  ...baseCookieOptions,
  path: '/',
  maxAge: ACCESS_TOKEN_TTL_MS,
};

const refreshCookieOptions = {
  ...baseCookieOptions,
  path: '/',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

module.exports = {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  computeFingerprint,
  generateCsrfToken,
  verifyCsrfToken,
  issueSession,
  rotateSession,
  revokeSession,
  revokeAllSessions,
  listSessions,
  issuePasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
  canIssuePasswordResetOtp,
  issuePasswordResetOtp,
  verifyPasswordResetOtp,
  issueWebauthnChallenge,
  consumeWebauthnChallenge,
  accessCookieOptions,
  refreshCookieOptions,
};
