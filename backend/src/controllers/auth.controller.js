const QRCode = require('qrcode');
const env = require('../config/env');
const User = require('../models/User');
const passwordPolicy = require('../services/passwordPolicy');
const tokenService = require('../services/tokenService');
const mfaService = require('../services/mfaService');
const rateLimitHelpers = require('../middleware/rateLimit');
const { logAudit } = require('../middleware/auditLogger');
const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');

const FAILED_ATTEMPTS_LOCKOUT_THRESHOLD = 12;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // cap runaway exponential growth at 24h

function computeLockoutDurationMs(priorLockoutCount) {
  return Math.min(BASE_LOCKOUT_MS * 2 ** priorLockoutCount, MAX_LOCKOUT_MS);
}

// Generic failure for login: same status/message whether the account doesn't exist, has
// no password (OAuth-only), is currently locked out, or the password is simply wrong —
// none of those should be distinguishable to the caller. Also feeds IP-level tracking
// (independent of whether the target account exists at all) and the audit trail — userId
// is only known when the attempt matched a real account (wrong password, locked account),
// not when the email itself didn't match anything.
async function failLogin(res, req, userId) {
  await rateLimitHelpers.recordFailedLoginFromIp(req.ip);
  await monitoringService.recordFailedLoginForAlerting(req.ip);
  await logAudit({
    actorId: userId,
    action: 'auth.login_failure',
    resourceType: 'User',
    resourceId: userId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return res.status(401).json({ error: 'Invalid email or password' });
}

// Device fingerprint for the optional device-binding feature (env.deviceBindingEnabled) —
// hashes the User-Agent header together with a stable, client-generated device id sent as
// X-Device-Id. Neither value is trusted on its own; the fingerprint is just a compensating
// signal recorded at login and re-checked on refresh, not an identity claim.
function getDeviceMeta(req) {
  const userAgent = req.headers['user-agent'] || '';
  const deviceId = req.headers['x-device-id'] || '';
  return { userAgent, fingerprint: tokenService.computeFingerprint(userAgent, deviceId) };
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, tokenService.accessCookieOptions);
  res.cookie('refresh_token', refreshToken, tokenService.refreshCookieOptions);
}

function clearAuthCookies(res) {
  // res.clearCookie(name, options) merges `options` on top of Express's own past-date
  // default — since our cookie options carry a positive maxAge, that merge leaves the
  // Max-Age attribute intact (a positive Max-Age wins over Expires per RFC 6265), so the
  // cookie would NOT actually be cleared in a real browser. Force maxAge/expires directly.
  res.cookie('access_token', '', {
    ...tokenService.accessCookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
  res.cookie('refresh_token', '', {
    ...tokenService.refreshCookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { valid, errors, strength } = passwordPolicy.validate(password, {
      name,
      email: normalizedEmail,
    });
    if (!valid) {
      return res.status(400).json({
        error: 'Password does not meet policy requirements',
        details: errors,
        strength,
      });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await passwordPolicy.hashPassword(password);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      passwordHistory: passwordPolicy.addToHistory([], passwordHash),
      passwordChangedAt: new Date(),
    });

    logger.info('User registered', { userId: user._id.toString() });
    await logAudit({
      actorId: user._id,
      action: 'auth.register',
      resourceType: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // 201, no sensitive data (passwordHash, etc.) echoed back — login/session comes in Phase 5.
    return res.status(201).json({
      message: 'Registration successful',
      strength,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const ip = req.ip;

    // Fail fast on an already-blocked IP without touching Mongo or the password hash.
    if (await rateLimitHelpers.isIpBlocked(ip)) {
      return res.status(429).json({ error: 'Too many attempts, please try again later' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      return await failLogin(res, req);
    }

    // Locked accounts are rejected before ever comparing the password — same generic
    // response as "wrong password", so a caller can't tell lockout apart from a bad guess.
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return await failLogin(res, req, user._id);
    }

    if (!user.passwordHash) {
      return await failLogin(res, req, user._id);
    }

    const passwordMatches = await passwordPolicy.comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= FAILED_ATTEMPTS_LOCKOUT_THRESHOLD) {
        const durationMs = computeLockoutDurationMs(user.lockoutCount);
        user.lockoutUntil = new Date(Date.now() + durationMs);
        user.lockoutCount += 1;
        user.failedLoginAttempts = 0;
        logger.warn('Account locked after repeated failed logins', {
          userId: user._id.toString(),
          lockoutCount: user.lockoutCount,
          durationMs,
        });
        await logAudit({
          actorId: user._id,
          action: 'auth.account_locked',
          resourceType: 'User',
          resourceId: user._id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      await user.save();
      return await failLogin(res, req, user._id);
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    // Password verified — clear brute-force state regardless of whether MFA is required next.
    user.failedLoginAttempts = 0;
    user.lockoutCount = 0;
    user.lockoutUntil = undefined;

    if (user.mfaEnabled) {
      await user.save();
      const mfaPendingToken = tokenService.signMfaPendingToken(user);
      logger.info('Password verified, awaiting MFA challenge', { userId: user._id.toString() });
      // No cookies yet — this token only proves "password was correct", not a session.
      return res.status(200).json({ mfaRequired: true, mfaPendingToken });
    }

    user.lastLogin = new Date();

    const { accessToken, refreshToken } = await tokenService.issueSession(user, getDeviceMeta(req));
    setAuthCookies(res, { accessToken, refreshToken });

    await user.save();

    logger.info('User logged in', { userId: user._id.toString() });
    await logAudit({
      actorId: user._id,
      action: 'auth.login_success',
      resourceType: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

async function mfaSetup(req, res, next) {
  try {
    const user = req.user;
    const secret = mfaService.generateSecret();
    const otpauthUrl = mfaService.buildOtpAuthUrl(secret, user.email);
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Stored but inert until verify-setup confirms the user actually has a working
    // authenticator — mfaEnabled stays false, so login isn't affected mid-enrollment.
    user.mfaSecretEncrypted = mfaService.encryptSecret(secret);
    user.mfaEnabled = false;
    await user.save();

    logger.info('MFA setup initiated', { userId: user._id.toString() });

    // `secret` is shown once, in plaintext, for manual entry as a QR-scan fallback — same
    // as every standard TOTP setup flow. It's never returned again after this response.
    return res.status(200).json({ qrCode, secret, otpauthUrl });
  } catch (err) {
    next(err);
  }
}

async function mfaVerifySetup(req, res, next) {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const user = await User.findById(req.user._id).select('+mfaSecretEncrypted');
    if (!user.mfaSecretEncrypted) {
      return res.status(400).json({ error: 'MFA setup has not been started' });
    }

    const secret = mfaService.decryptSecret(user.mfaSecretEncrypted);
    if (!mfaService.verifyToken(token, secret)) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    user.mfaEnabled = true;
    await user.save();

    logger.info('MFA enabled', { userId: user._id.toString() });

    return res.status(200).json({ message: 'MFA enabled' });
  } catch (err) {
    next(err);
  }
}

async function mfaChallenge(req, res, next) {
  try {
    const { mfaPendingToken, token } = req.body || {};
    if (!mfaPendingToken || !token) {
      return res.status(400).json({ error: 'mfaPendingToken and token are required' });
    }

    const auditBase = { resourceType: 'User', ip: req.ip, userAgent: req.headers['user-agent'] };

    let payload;
    try {
      payload = tokenService.verifyMfaPendingToken(mfaPendingToken);
    } catch (err) {
      await logAudit({ ...auditBase, action: 'auth.mfa_challenge_failure' });
      return res.status(401).json({ error: 'Invalid or expired MFA challenge' });
    }

    const user = await User.findById(payload.sub).select('+mfaSecretEncrypted');
    if (!user || user.status === 'suspended' || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      await logAudit({ ...auditBase, action: 'auth.mfa_challenge_failure', actorId: payload.sub, resourceId: payload.sub });
      return res.status(401).json({ error: 'Invalid or expired MFA challenge' });
    }

    const secret = mfaService.decryptSecret(user.mfaSecretEncrypted);
    if (!mfaService.verifyToken(token, secret)) {
      await logAudit({ ...auditBase, action: 'auth.mfa_challenge_failure', actorId: user._id, resourceId: user._id });
      return res.status(401).json({ error: 'Invalid code' });
    }

    user.lastLogin = new Date();

    const { accessToken, refreshToken } = await tokenService.issueSession(user, getDeviceMeta(req));
    setAuthCookies(res, { accessToken, refreshToken });

    await user.save();

    logger.info('MFA challenge succeeded', { userId: user._id.toString() });
    await logAudit({ ...auditBase, action: 'auth.mfa_challenge_success', actorId: user._id, resourceId: user._id });

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

function googleProfileEmail(profile) {
  return profile.emails?.[0]?.value?.toLowerCase() || null;
}

// GET /api/auth/google/callback — plain "log in with Google".
async function googleLoginCallback(req, res, next) {
  try {
    const profile = req.user;
    const googleId = profile.id;
    const email = googleProfileEmail(profile);

    if (!email) {
      return res.redirect(`${env.frontendOrigin}/login?oauth=error`);
    }

    let user = await User.findOne({
      'oauthProviders.provider': 'google',
      'oauthProviders.providerId': googleId,
    });

    if (!user) {
      // No OAuth-linked account yet — but if a local (password) account already exists
      // with this email, do NOT auto-link. We have no email-verification flow, so trusting
      // "same email = same person" here would let anyone who merely knows a victim's email
      // take over their account via Google sign-in. Direct them to log in with their
      // password first and link Google from an authenticated "Connect Google" action instead.
      const existingLocal = await User.findOne({ email });
      if (existingLocal) {
        return res.redirect(`${env.frontendOrigin}/login?oauth=email_exists`);
      }

      user = await User.create({
        name: profile.displayName || email,
        email,
        oauthProviders: [{ provider: 'google', providerId: googleId }],
      });
      logger.info('User registered via Google OAuth', { userId: user._id.toString() });
    }

    if (user.status === 'suspended') {
      return res.redirect(`${env.frontendOrigin}/login?oauth=suspended`);
    }

    user.lastLogin = new Date();
    const { accessToken, refreshToken } = await tokenService.issueSession(user, getDeviceMeta(req));
    setAuthCookies(res, { accessToken, refreshToken });
    await user.save();

    logger.info('User logged in via Google OAuth', { userId: user._id.toString() });

    return res.redirect(`${env.frontendOrigin}/oauth/callback?status=success`);
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/google/link/callback — "Connect Google" from an already-logged-in user's
// profile settings. The initiating route (/google/link) requires auth before it will even
// redirect to Google; this callback independently re-verifies the access_token cookie
// (which survives the redirect round-trip, since it's a same-site navigation) rather than
// trusting anything client-supplied about which account to attach the Google identity to.
async function googleLinkCallback(req, res, next) {
  try {
    const accessTokenCookie = req.cookies?.access_token;
    let payload;
    try {
      payload = accessTokenCookie ? tokenService.verifyAccessToken(accessTokenCookie) : null;
    } catch (err) {
      payload = null;
    }
    if (!payload) {
      return res.redirect(`${env.frontendOrigin}/profile?oauth=link_requires_login`);
    }

    const profile = req.user;
    const googleId = profile.id;

    const linkedElsewhere = await User.findOne({
      'oauthProviders.provider': 'google',
      'oauthProviders.providerId': googleId,
    });
    if (linkedElsewhere && linkedElsewhere._id.toString() !== payload.sub) {
      return res.redirect(`${env.frontendOrigin}/profile?oauth=already_linked_elsewhere`);
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.redirect(`${env.frontendOrigin}/profile?oauth=link_error`);
    }

    const alreadyLinkedToSelf = user.oauthProviders.some(
      (p) => p.provider === 'google' && p.providerId === googleId
    );
    if (!alreadyLinkedToSelf) {
      user.oauthProviders.push({ provider: 'google', providerId: googleId });
      await user.save();
      logger.info('Google account linked', { userId: user._id.toString() });
    }

    return res.redirect(`${env.frontendOrigin}/profile?oauth=linked`);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    let payload;
    try {
      payload = tokenService.verifyRefreshToken(token);
    } catch (err) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const { sub: userId, sid: sessionId, jti } = payload;

    const user = await User.findById(userId);
    if (!user || user.status === 'suspended') {
      await tokenService.revokeSession(userId, sessionId);
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const rotated = await tokenService.rotateSession({ userId, sessionId, jti }, user, getDeviceMeta(req));
    if (!rotated) {
      // Reuse of an already-rotated refresh token, an unknown/expired session, or (if
      // device binding is enabled) a device-fingerprint mismatch — the whole family was
      // just revoked inside rotateSession(). Same generic response either way, so a caller
      // can't tell which of those actually happened. Force re-login.
      clearAuthCookies(res);
      logger.warn('Refresh rejected: reuse, invalid session, or device mismatch', { userId, sessionId });
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }

    setAuthCookies(res, rotated);
    return res.status(200).json({ message: 'Token refreshed' });
  } catch (err) {
    next(err);
  }
}

function getCurrentSessionId(req) {
  const token = req.cookies?.refresh_token;
  if (!token) return null;
  try {
    return tokenService.verifyRefreshToken(token).sid;
  } catch (err) {
    return null;
  }
}

// GET /api/csrf-token — bound to the refresh session, not the access token, since a user
// whose access token just expired (but whose refresh session is still valid) should still
// be able to fetch one without a round trip through /refresh first.
async function getCsrfToken(req, res, next) {
  try {
    const sessionId = getCurrentSessionId(req);
    if (!sessionId) {
      return res.status(401).json({ error: 'No active session' });
    }

    return res.status(200).json({ csrfToken: tokenService.generateCsrfToken(sessionId) });
  } catch (err) {
    next(err);
  }
}

async function listSessionsForUser(req, res, next) {
  try {
    const sessions = await tokenService.listSessions(req.user._id.toString());
    const currentSessionId = getCurrentSessionId(req);
    const withCurrent = sessions
      .map((s) => ({ ...s, current: s.sessionId === currentSessionId }))
      .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));

    return res.status(200).json({ sessions: withCurrent });
  } catch (err) {
    next(err);
  }
}

async function revokeSessionForUser(req, res, next) {
  try {
    // No separate ownership check needed: the Redis key is session:{req.user._id}:{id},
    // so this can never touch another user's session regardless of what :id is supplied —
    // deleting a key under someone else's prefix isn't reachable from here at all.
    await tokenService.revokeSession(req.user._id.toString(), req.params.id);
    return res.status(200).json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const { sub: userId, sid: sessionId } = tokenService.verifyRefreshToken(token);
        await tokenService.revokeSession(userId, sessionId);
      } catch (err) {
        // Token already invalid/expired — nothing to revoke, just clear cookies below.
      }
    }
    clearAuthCookies(res);
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  mfaSetup,
  mfaVerifySetup,
  mfaChallenge,
  googleLoginCallback,
  googleLinkCallback,
  listSessionsForUser,
  revokeSessionForUser,
  getCsrfToken,
};
