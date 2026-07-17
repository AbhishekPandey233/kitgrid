const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const env = require('../config/env');

const LOGIN_CALLBACK_PATH = '/api/auth/google/callback';
const LINK_CALLBACK_PATH = '/api/auth/google/link/callback';

const isConfigured = Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret);

function verifyCallback(accessToken, refreshToken, profile, done) {
  done(null, profile);
}

if (isConfigured) {
  passport.use(
    'google',
    new GoogleStrategy(
      {
        clientID: env.googleOAuthClientId,
        clientSecret: env.googleOAuthClientSecret,
        callbackURL: `${env.backendOrigin}${LOGIN_CALLBACK_PATH}`,
      },
      verifyCallback
    )
  );

  passport.use(
    'google-link',
    new GoogleStrategy(
      {
        clientID: env.googleOAuthClientId,
        clientSecret: env.googleOAuthClientSecret,
        callbackURL: `${env.backendOrigin}${LINK_CALLBACK_PATH}`,
      },
      verifyCallback
    )
  );
}

function requireOAuthConfigured(req, res, next) {
  if (!isConfigured) {
    return res.status(503).json({ error: 'Google OAuth is not configured' });
  }
  next();
}

module.exports = { passport, isConfigured, requireOAuthConfigured };
