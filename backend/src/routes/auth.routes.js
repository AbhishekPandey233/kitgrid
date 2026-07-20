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
  forgotPassword,
  resendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  getDebugEmails,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnLoginOptions,
  webauthnLoginVerify,
  getCurrentUser,
  checkPasswordStrength,
  getCsrfToken,
} = require('../controllers/auth.controller');
const { strictAuthLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { requireCaptcha } = require('../services/captchaService');
const { passport, requireOAuthConfigured } = require('../services/oauthService');

const router = express.Router();

router.post('/password-strength', checkPasswordStrength);

router.post('/register', strictAuthLimiter, requireCaptcha, register);
router.post('/login', strictAuthLimiter, requireCaptcha, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, getCurrentUser);

router.get('/csrf-token', getCsrfToken);

router.post('/mfa/setup', requireAuth, mfaSetup);
router.post('/mfa/verify-setup', strictAuthLimiter, requireAuth, mfaVerifySetup);
router.post('/mfa/challenge', strictAuthLimiter, mfaChallenge);

router.post('/forgot-password', strictAuthLimiter, forgotPassword);
router.post('/forgot-password/resend', strictAuthLimiter, resendForgotPasswordOtp);
router.post('/forgot-password/verify-otp', strictAuthLimiter, verifyForgotPasswordOtp);
router.post('/reset-password/:token', strictAuthLimiter, resetPassword);
router.get('/debug/last-emails', getDebugEmails);

router.post('/webauthn/register-options', requireAuth, webauthnRegisterOptions);
router.post('/webauthn/register-verify', strictAuthLimiter, requireAuth, webauthnRegisterVerify);

router.post('/webauthn/login-options', strictAuthLimiter, webauthnLoginOptions);
router.post('/webauthn/login-verify', strictAuthLimiter, webauthnLoginVerify);

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
