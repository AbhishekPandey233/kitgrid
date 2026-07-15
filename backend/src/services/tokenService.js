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

// Why a 15-day access token needs the refresh-side machinery below:
//
// Access tokens are verified by signature alone (no DB/Redis round trip) so that most
// requests stay cheap and stateless — that's the whole point of using a JWT for it. The
// cost of that statelessness is that a signed access token can't be individually killed
// before it expires; there is no "delete this one token" operation. A 15-day lifetime
// makes that gap wide enough to matter, so we compensate at two different layers instead
// of trying to revoke the access token itself:
//   1. Session-level control lives at the refresh token, not the access token. Every
//      refresh rotates the token (below) and is checked against a Redis whitelist keyed
//      by session — logout, or detected reuse of an already-rotated refresh token, deletes
//      that Redis entry immediately. This bounds how long a *stolen refresh token* is useful
//      for (one use, then it's burned), even though it doesn't reach back and invalidate an
//      access token already handed out.
//   2. Authorization decisions (role, suspension) are re-derived from MongoDB on every
//      protected request (Phase 10's auth middleware), not trusted from the JWT payload.
//      So even though a leaked access token's *signature* stays valid for up to 15 days,
//      suspending the account or changing its role takes effect on the very next request
//      regardless of what the token claims.
// In short: the access token's long life is a UX trade-off (fewer refresh round trips);
// the actual revocable state lives in Redis (session) and MongoDB (identity), not in the
// access token itself.

function sessionKey(userId, sessionId) {
  return `session:${userId}:${sessionId}`;
}

// Device binding (optional, env.deviceBindingEnabled): hash of User-Agent + a stable
// client-generated device id (sent as the X-Device-Id header), stored alongside the
// session at login and re-checked on every refresh.
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

// Access and mfa_pending tokens are both signed with env.jwtSecret, so the `purpose`
// claim is what stops one from being replayed as the other — a pending token only proves
// "password was correct", not that MFA was completed, and must never pass as a session.
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

// Short-lived intermediate token issued when a password check succeeds but MFA is still
// required — deliberately not a session (no cookies, no Redis-tracked session). Carries a
// `purpose` claim so it can't be mistaken for (or substituted by) a real access token.
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

// Login: always mints a brand-new session id ("family") — never reused/derived from
// anything client-supplied — which is what actually prevents session fixation: there is no
// way for an attacker to pre-seed a session identifier that a victim's login would adopt.
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

// Rotates the refresh token within an existing session. Returns null if the presented jti
// isn't the one currently whitelisted for this session (stale/already-rotated token being
// replayed — a theft signal — or an unknown/expired session), or if device binding is
// enabled and the presented fingerprint doesn't match the one recorded at login. Either way
// the whole session is deleted so the family can't be used again.
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

// Lists a user's own active sessions. Scoped by construction to session:{userId}:* — there
// is no way to enumerate or touch another user's sessions through this function.
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

// CSRF token: an HMAC of the requester's session id, not a random value in a second
// cookie. A plain cookie-vs-header double-submit token is vulnerable to an attacker who
// can plant their own cookie for this origin (e.g. from a sibling subdomain) — signing the
// session id instead means the token is only ever valid for the one session it was issued
// for, verifiable without any server-side storage.
function generateCsrfToken(sessionId) {
  return crypto.createHmac('sha256', env.csrfSecret).update(sessionId).digest('hex');
}

function verifyCsrfToken(sessionId, token) {
  if (!sessionId || !token || typeof token !== 'string') {
    return false;
  }

  const expected = Buffer.from(generateCsrfToken(sessionId), 'hex');
  const submitted = Buffer.from(token, 'hex');

  // Length check first: timingSafeEqual throws on mismatched lengths, and a malformed
  // (non-hex or wrong-length) header would otherwise crash the request instead of just
  // failing verification.
  if (expected.length !== submitted.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, submitted);
}

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  // Off for local HTTP dev/demo (cookies wouldn't be sent otherwise); on automatically
  // once deployed behind real HTTPS in production.
  secure: env.nodeEnv === 'production',
};

const accessCookieOptions = {
  ...baseCookieOptions,
  path: '/',
  maxAge: ACCESS_TOKEN_TTL_MS,
};

// Scoped to /api/auth so the refresh token isn't sent on every ordinary API request —
// only to the endpoints that actually need it.
const refreshCookieOptions = {
  ...baseCookieOptions,
  path: '/api/auth',
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
  listSessions,
  accessCookieOptions,
  refreshCookieOptions,
};
