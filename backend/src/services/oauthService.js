const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const env = require('../config/env');

// Two distinct callback URLs (rather than one shared callback disambiguated by a `state`
// value) so "log in with Google" and "link Google to my logged-in account" never get
// confused with each other — each strategy only ever completes its own flow.
const LOGIN_CALLBACK_PATH = '/api/auth/google/callback';
const LINK_CALLBACK_PATH = '/api/auth/google/link/callback';

const isConfigured = Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret);

// Just hand the raw profile through — account lookup/creation/linking logic lives in the
// controller, where it can be reasoned about (and tested) independently of passport.
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
