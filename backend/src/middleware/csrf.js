const tokenService = require('../services/tokenService');

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const EXEMPT_EXACT_ROUTES = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/mfa/challenge',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/webauthn/login-options',
  'POST /api/auth/webauthn/login-verify',
  'POST /api/auth/password-strength',
]);

const RESET_PASSWORD_PREFIX = '/api/auth/reset-password/';

function isExemptRoute(req) {
  if (EXEMPT_EXACT_ROUTES.has(`${req.method} ${req.path}`)) {
    return true;
  }
  return req.method === 'POST' && req.path.startsWith(RESET_PASSWORD_PREFIX);
}

function getSessionId(req) {
  const token = req.cookies?.refresh_token;
  if (!token) return null;
  try {
    return tokenService.verifyRefreshToken(token).sid;
  } catch (err) {
    return null;
  }
}

function requireCsrfToken(req, res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  if (isExemptRoute(req)) {
    return next();
  }

  const sessionId = getSessionId(req);
  const submittedToken = req.headers['x-csrf-token'];

  if (!tokenService.verifyCsrfToken(sessionId, submittedToken)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }

  next();
}

module.exports = { requireCsrfToken };
