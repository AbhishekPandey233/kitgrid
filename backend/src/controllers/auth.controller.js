const QRCode = require('qrcode');
const webauthn = require('@simplewebauthn/server');
const env = require('../config/env');
const User = require('../models/User');
const passwordPolicy = require('../services/passwordPolicy');
const tokenService = require('../services/tokenService');
const mfaService = require('../services/mfaService');
const webauthnService = require('../services/webauthnService');
const rateLimitHelpers = require('../middleware/rateLimit');
const { logAudit } = require('../middleware/auditLogger');
const monitoringService = require('../services/monitoringService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const FAILED_ATTEMPTS_LOCKOUT_THRESHOLD = 12;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;
const PASSWORD_EXPIRY_MS = env.passwordExpiryDays * 24 * 60 * 60 * 1000;

function computeLockoutDurationMs(priorLockoutCount) {
  return Math.min(BASE_LOCKOUT_MS * 2 ** priorLockoutCount, MAX_LOCKOUT_MS);
}

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

function getDeviceMeta(req) {
  const userAgent = req.headers['user-agent'] || '';
  const deviceId = req.headers['x-device-id'] || '';
  return { userAgent, fingerprint: tokenService.computeFingerprint(userAgent, deviceId) };
}

function clearLegacyScopedRefreshCookie(res) {
  res.cookie('refresh_token', '', {
    ...tokenService.refreshCookieOptions,
    path: '/api/auth',
    maxAge: 0,
    expires: new Date(0),
  });
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, tokenService.accessCookieOptions);
  res.cookie('refresh_token', refreshToken, tokenService.refreshCookieOptions);
  clearLegacyScopedRefreshCookie(res);
}

function clearAuthCookies(res) {
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
  clearLegacyScopedRefreshCookie(res);
}

async function checkPasswordStrength(req, res) {
  const { password, name, email } = req.body || {};
  const result = passwordPolicy.validate(password || '', { name, email });
  return res.status(200).json(result);
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

    if (await rateLimitHelpers.isIpBlocked(ip)) {
      return res.status(429).json({ error: 'Too many attempts, please try again later' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      return await failLogin(res, req);
    }

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

    user.failedLoginAttempts = 0;
    user.lockoutCount = 0;
    user.lockoutUntil = undefined;

    if (user.passwordChangedAt && Date.now() - user.passwordChangedAt.getTime() > PASSWORD_EXPIRY_MS) {
      await user.save();
      logger.info('Login rejected: password expired', { userId: user._id.toString() });
      return res.status(403).json({
        error: 'Your password has expired and must be reset',
        passwordExpired: true,
      });
    }

    if (user.mfaEnabled) {
      await user.save();
      const mfaPendingToken = tokenService.signMfaPendingToken(user);
      logger.info('Password verified, awaiting MFA challenge', { userId: user._id.toString() });
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
      user: { id: user._id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled },
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

    user.mfaSecretEncrypted = mfaService.encryptSecret(secret);
    user.mfaEnabled = false;
    await user.save();

    logger.info('MFA setup initiated', { userId: user._id.toString() });

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
      user: { id: user._id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled },
    });
  } catch (err) {
    next(err);
  }
}

// Shared by the initial forgot-password request and the resend button — same email/cooldown/
// audit handling either way, since resending is just asking for a fresh OTP.
async function sendPasswordResetOtp(req) {
  const { email } = req.body || {};
  if (!email) return;

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!(await tokenService.canIssuePasswordResetOtp(normalizedEmail))) {
    return;
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return;

  const otp = await tokenService.issuePasswordResetOtp(normalizedEmail);

  try {
    await emailService.sendPasswordResetOtpEmail(user.email, otp);
  } catch (err) {
    logger.error('Failed to send password reset OTP email', { userId: user._id.toString(), error: err.message });
  }

  await logAudit({
    actorId: user._id,
    action: 'auth.password_reset_requested',
    resourceType: 'User',
    resourceId: user._id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
}

async function forgotPassword(req, res, next) {
  try {
    await sendPasswordResetOtp(req);
    return res.status(200).json({ message: 'If an account with that email exists, a code has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function resendForgotPasswordOtp(req, res, next) {
  try {
    await sendPasswordResetOtp(req);
    return res.status(200).json({ message: 'If an account with that email exists, a new code has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function verifyForgotPasswordOtp(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    const invalidResponse = () => res.status(400).json({ error: 'Invalid or expired code' });

    if (!email || !otp) {
      return invalidResponse();
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return invalidResponse();
    }

    const valid = await tokenService.verifyPasswordResetOtp(normalizedEmail, String(otp));
    if (!valid) {
      return invalidResponse();
    }

    const resetToken = await tokenService.issuePasswordResetToken(user._id.toString());
    return res.status(200).json({ resetToken });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token } = req.params;
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'password is required' });
    }

    const userId = await tokenService.verifyPasswordResetToken(token);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await User.findById(userId).select('+passwordHash +passwordHistory');
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const { valid, errors, strength } = passwordPolicy.validate(password, {
      name: user.name,
      email: user.email,
    });
    if (!valid) {
      return res.status(400).json({
        error: 'Password does not meet policy requirements',
        details: errors,
        strength,
      });
    }

    if (await passwordPolicy.checkReuse(password, user.passwordHistory)) {
      return res.status(400).json({ error: 'That password was used recently — choose a different one' });
    }

    const passwordHash = await passwordPolicy.hashPassword(password);
    user.passwordHash = passwordHash;
    user.passwordHistory = passwordPolicy.addToHistory(user.passwordHistory, passwordHash);
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockoutCount = 0;
    user.lockoutUntil = undefined;
    await user.save();

    await tokenService.revokeAllSessions(user._id.toString());
    await tokenService.consumePasswordResetToken(token);

    logger.info('Password reset completed', { userId: user._id.toString() });
    await logAudit({
      actorId: user._id,
      action: 'auth.password_reset_completed',
      resourceType: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({ message: 'Password has been reset. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

async function getDebugEmails(req, res) {
  if (env.nodeEnv === 'production') {
    return res.status(404).end();
  }
  return res.status(200).json({ emails: emailService.getRecentPreviews() });
}

async function webauthnRegisterOptions(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+webauthnCredentials');

    const options = await webauthn.generateRegistrationOptions({
      rpName: webauthnService.RP_NAME,
      rpID: webauthnService.RP_ID,
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: user.webauthnCredentials.map(webauthnService.credentialToDescriptor),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    await tokenService.issueWebauthnChallenge('register', user._id.toString(), options.challenge);

    return res.status(200).json(options);
  } catch (err) {
    next(err);
  }
}

async function webauthnRegisterVerify(req, res, next) {
  try {
    const { response, deviceLabel } = req.body || {};
    if (!response) {
      return res.status(400).json({ error: 'response is required' });
    }

    const expectedChallenge = await tokenService.consumeWebauthnChallenge('register', req.user._id.toString());
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Registration ceremony expired or was never started' });
    }

    let verification;
    try {
      verification = await webauthn.verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: webauthnService.ORIGIN,
        expectedRPID: webauthnService.RP_ID,
      });
    } catch (err) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }

    const { credential } = verification.registrationInfo;
    const user = await User.findById(req.user._id).select('+webauthnCredentials');

    if (user.webauthnCredentials.some((c) => c.credentialID === credential.id)) {
      return res.status(409).json({ error: 'This authenticator is already registered' });
    }

    user.webauthnCredentials.push({
      ...webauthnService.toStoredCredential(credential),
      transports: credential.transports || [],
      deviceLabel: deviceLabel ? String(deviceLabel).slice(0, 100) : 'Passkey',
    });
    await user.save();

    logger.info('WebAuthn credential registered', { userId: user._id.toString() });
    await logAudit({
      actorId: user._id,
      action: 'auth.webauthn_registered',
      resourceType: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({ message: 'Authenticator registered' });
  } catch (err) {
    next(err);
  }
}

async function webauthnLoginOptions(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+webauthnCredentials');

    if (!user || user.webauthnCredentials.length === 0) {
      return res.status(400).json({ error: 'No passkeys registered for this account' });
    }

    const options = await webauthn.generateAuthenticationOptions({
      rpID: webauthnService.RP_ID,
      allowCredentials: user.webauthnCredentials.map(webauthnService.credentialToDescriptor),
      userVerification: 'preferred',
    });

    await tokenService.issueWebauthnChallenge('login', user._id.toString(), options.challenge);

    return res.status(200).json(options);
  } catch (err) {
    next(err);
  }
}

async function webauthnLoginVerify(req, res, next) {
  try {
    const { email, response } = req.body || {};
    if (!email || !response) {
      return res.status(400).json({ error: 'email and response are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+webauthnCredentials');
    if (!user) {
      return res.status(401).json({ error: 'Invalid passkey login' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    const expectedChallenge = await tokenService.consumeWebauthnChallenge('login', user._id.toString());
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Login ceremony expired or was never started' });
    }

    const stored = user.webauthnCredentials.find((c) => c.credentialID === response.id);
    if (!stored) {
      return res.status(401).json({ error: 'Invalid passkey login' });
    }

    let verification;
    try {
      verification = await webauthn.verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: webauthnService.ORIGIN,
        expectedRPID: webauthnService.RP_ID,
        credential: webauthnService.toLibraryCredential(stored),
      });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid passkey login' });
    }

    if (!verification.verified) {
      return res.status(401).json({ error: 'Invalid passkey login' });
    }

    stored.counter = verification.authenticationInfo.newCounter;

    if (user.mfaEnabled) {
      await user.save();
      const mfaPendingToken = tokenService.signMfaPendingToken(user);
      logger.info('Passkey verified, awaiting MFA challenge', { userId: user._id.toString() });
      return res.status(200).json({ mfaRequired: true, mfaPendingToken });
    }

    user.lastLogin = new Date();
    const { accessToken, refreshToken } = await tokenService.issueSession(user, getDeviceMeta(req));
    setAuthCookies(res, { accessToken, refreshToken });
    await user.save();

    logger.info('User logged in via passkey', { userId: user._id.toString() });
    await logAudit({
      actorId: user._id,
      action: 'auth.webauthn_login_success',
      resourceType: 'User',
      resourceId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled },
    });
  } catch (err) {
    next(err);
  }
}

function googleProfileEmail(profile) {
  return profile.emails?.[0]?.value?.toLowerCase() || null;
}

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

async function getCurrentUser(req, res) {
  const user = req.user;
  return res.status(200).json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled },
  });
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

async function getCsrfToken(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'no-store');

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
};
