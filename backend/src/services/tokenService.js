const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const redisClient = require('../config/redis');

const ACCESS_TOKEN_TTL = '15d';
const ACCESS_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * 1000;

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

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken({ userId, sessionId, jti }) {
  return jwt.sign({ sub: userId, sid: sessionId, jti }, env.jwtRefreshSecret, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

// Login: starts a new session ("family") and whitelists its first refresh token jti.
async function issueSession(user) {
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  await redisClient.set(sessionKey(user._id.toString(), sessionId), jti, {
    EX: REFRESH_TOKEN_TTL_SECONDS,
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken({ userId: user._id.toString(), sessionId, jti }),
    sessionId,
  };
}

// Rotates the refresh token within an existing session. Returns null if the presented jti
// isn't the one currently whitelisted for this session — that means either a stale/already-
// rotated token is being replayed (theft signal) or the session was revoked, and either way
// the whole session is deleted so the family can't be used again.
async function rotateSession({ userId, sessionId, jti }, user) {
  const key = sessionKey(userId, sessionId);
  const currentJti = await redisClient.get(key);

  if (!currentJti || currentJti !== jti) {
    await redisClient.del(key);
    return null;
  }

  const newJti = crypto.randomUUID();
  await redisClient.set(key, newJti, { EX: REFRESH_TOKEN_TTL_SECONDS });

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken({ userId, sessionId, jti: newJti }),
  };
}

async function revokeSession(userId, sessionId) {
  await redisClient.del(sessionKey(userId, sessionId));
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
  issueSession,
  rotateSession,
  revokeSession,
  accessCookieOptions,
  refreshCookieOptions,
};
