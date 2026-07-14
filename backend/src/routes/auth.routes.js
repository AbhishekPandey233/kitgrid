const express = require('express');
const {
  register,
  login,
  refresh,
  logout,
  mfaSetup,
  mfaVerifySetup,
  mfaChallenge,
} = require('../controllers/auth.controller');
const { strictAuthLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', strictAuthLimiter, register);
router.post('/login', strictAuthLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

router.post('/mfa/setup', requireAuth, mfaSetup);
router.post('/mfa/verify-setup', strictAuthLimiter, requireAuth, mfaVerifySetup);
router.post('/mfa/challenge', strictAuthLimiter, mfaChallenge);

module.exports = router;
