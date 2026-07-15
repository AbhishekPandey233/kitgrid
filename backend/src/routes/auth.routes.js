const express = require('express');
const env = require('../config/env');
const {
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
} = require('../controllers/auth.controller');
const { strictAuthLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { requireCaptcha } = require('../services/captchaService');
const { passport, requireOAuthConfigured } = require('../services/oauthService');

const router = express.Router();

router.post('/register', strictAuthLimiter, requireCaptcha, register);
router.post('/login', strictAuthLimiter, requireCaptcha, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

router.post('/mfa/setup', requireAuth, mfaSetup);
router.post('/mfa/verify-setup', strictAuthLimiter, requireAuth, mfaVerifySetup);
router.post('/mfa/challenge', strictAuthLimiter, mfaChallenge);

// Listing is a read-only, idempotent lookup, so GET rather than POST — the more
// conventional REST verb for "list my own sessions".
router.get('/sessions', requireAuth, listSessionsForUser);
router.delete('/sessions/:id', requireAuth, revokeSessionForUser);

router.get(
  '/google',
  requireOAuthConfigured,
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/callback',
  requireOAuthConfigured,
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.frontendOrigin}/login?oauth=error`,
  }),
  googleLoginCallback
);

// Authenticated-only: lets an already-logged-in user attach a Google identity to their
// existing account, separate from the plain login path above.
router.get(
  '/google/link',
  requireOAuthConfigured,
  requireAuth,
  passport.authenticate('google-link', { scope: ['profile', 'email'], session: false })
);
router.get(
  '/google/link/callback',
  requireOAuthConfigured,
  passport.authenticate('google-link', {
    session: false,
    failureRedirect: `${env.frontendOrigin}/profile?oauth=link_error`,
  }),
  googleLinkCallback
);

module.exports = router;
