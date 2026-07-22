const fs = require('fs');
require('dotenv').config();

// True only when both paths are set AND the files actually exist — e.g. CI sets
// TLS_CERT_PATH via docker-compose.yml's hardcoded environment: block but has no real cert
// mounted (certs/ is gitignored, empty in a fresh checkout), so the server falls back to
// plain HTTP there. Cookies' Secure flag (tokenService.js) must track this, not just whether
// the env vars are set, or Secure cookies would be silently dropped over that HTTP fallback.
const tlsEnabled = Boolean(
  process.env.TLS_CERT_PATH &&
    process.env.TLS_KEY_PATH &&
    fs.existsSync(process.env.TLS_CERT_PATH) &&
    fs.existsSync(process.env.TLS_KEY_PATH)
);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  tlsCertPath: process.env.TLS_CERT_PATH,
  tlsKeyPath: process.env.TLS_KEY_PATH,
  tlsEnabled,
  dbUri: process.env.DB_URI || 'mongodb://127.0.0.1:27017/kitgrid',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  backendOrigin: process.env.BACKEND_ORIGIN || 'http://localhost:5000',
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  csrfSecret: process.env.CSRF_SECRET || process.env.JWT_SECRET,
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,
  captchaSecret: process.env.CAPTCHA_SECRET,
  etherealEmail: process.env.ETHEREAL_EMAIL,
  etherealPassword: process.env.ETHEREAL_PASSWORD,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  emailFrom: process.env.EMAIL_FROM,
  allowedIps: process.env.ALLOWED_IPS || '',
  deviceBindingEnabled: process.env.DEVICE_BINDING_ENABLED === 'true',
  passwordExpiryDays: parseInt(process.env.PASSWORD_EXPIRY_DAYS, 10) || 90,
  webauthnRpId:
    process.env.WEBAUTHN_RP_ID || new URL(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').hostname,
  webauthnRpName: process.env.WEBAUTHN_RP_NAME || 'KitGrid',
};
