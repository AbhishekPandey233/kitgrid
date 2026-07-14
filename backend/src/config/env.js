require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  dbUri: process.env.DB_URI || 'mongodb://127.0.0.1:27017/kitgrid',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  backendOrigin: process.env.BACKEND_ORIGIN || 'http://localhost:5000',
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,
  captchaSecret: process.env.CAPTCHA_SECRET,
  etherealEmail: process.env.ETHEREAL_EMAIL,
  etherealPassword: process.env.ETHEREAL_PASSWORD,
  // Comma-separated IPs that bypass IP-based login lockout (e.g. trusted office/CI IPs).
  allowedIps: process.env.ALLOWED_IPS || '',
};
