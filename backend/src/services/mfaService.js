const { authenticator } = require('otplib');
const encryptionService = require('./encryptionService');

authenticator.options = { window: 1 };

function generateSecret() {
  return authenticator.generateSecret();
}

function buildOtpAuthUrl(secret, email) {
  return authenticator.keyuri(email, 'KitGrid', secret);
}

function verifyToken(token, secret) {
  try {
    return authenticator.verify({ token, secret });
  } catch (err) {
    return false;
  }
}

function encryptSecret(secret) {
  return encryptionService.encrypt(secret);
}

function decryptSecret(encryptedSecret) {
  return encryptionService.decrypt(encryptedSecret);
}

module.exports = {
  generateSecret,
  buildOtpAuthUrl,
  verifyToken,
  encryptSecret,
  decryptSecret,
};
