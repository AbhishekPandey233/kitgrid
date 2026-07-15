const tokenService = require('../services/tokenService');

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes that legitimately have no session yet (or are establishing/exchanging one) at the
// point they're called, so there's nothing to bind a CSRF token to:
//   - register/login/forgot-password/reset-password: no session exists before these
//     succeed — a forgotten-password flow starts from a logged-out state by definition.
//   - refresh: often auto-triggered by a frontend interceptor on 401; requiring a fresh
//     CSRF token at that exact moment creates a bootstrapping problem, and the refresh
//     cookie itself is SameSite=Strict + scoped to /api/auth, so it can't be attached by a
//     genuine cross-site request in the first place.
//   - mfa/challenge: exchanges a short-lived mfa_pending token (not a session) for one.
//   - logout: same SameSite=Strict argument as refresh, and forcing a logout cross-site
//     has no meaningful impact even if it were possible.
// The OAuth callback route isn't listed here because it's a GET request — it's excluded by
// the method check below, not by this list.
const EXEMPT_EXACT_ROUTES = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/mfa/challenge',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
]);

// reset-password/:token carries the token as a path segment, so it can't be matched as a
// fixed string the way the routes above can.
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
