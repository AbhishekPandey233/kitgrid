const User = require('../models/User');
const passwordPolicy = require('../services/passwordPolicy');
const tokenService = require('../services/tokenService');
const logger = require('../utils/logger');

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

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Same generic error for "no such user", "OAuth-only account with no password", and
    // "wrong password" — none of these should let a caller distinguish a valid email from
    // an invalid one.
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await passwordPolicy.comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    const { accessToken, refreshToken } = await tokenService.issueSession(user);
    setAuthCookies(res, { accessToken, refreshToken });

    user.lastLogin = new Date();
    await user.save();

    logger.info('User logged in', { userId: user._id.toString() });

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
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

    const rotated = await tokenService.rotateSession({ userId, sessionId, jti }, user);
    if (!rotated) {
      // Reuse of an already-rotated refresh token, or an unknown/expired session — the
      // whole family was just revoked inside rotateSession(). Force re-login rather than
      // trusting a token that's either stolen or stale.
      clearAuthCookies(res);
      logger.warn('Refresh token reuse or invalid session detected', { userId, sessionId });
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }

    setAuthCookies(res, rotated);
    return res.status(200).json({ message: 'Token refreshed' });
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

module.exports = { register, login, refresh, logout };
