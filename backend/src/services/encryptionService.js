const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce length for GCM
const AUTH_TAG_LENGTH = 16;

// MFA_ENCRYPTION_KEY may be any length/format as configured in env — hash it down to a
// deterministic 32-byte key rather than requiring the raw env value to already be exactly
// 32 bytes. Key rotation/KMS handling is documented in docs/key-management.md (Phase 22).
function getKey() {
  if (!env.mfaEncryptionKey) {
    throw new Error('MFA_ENCRYPTION_KEY is not set');
  }
  return crypto.createHash('sha256').update(env.mfaEncryptionKey).digest();
}

// AES-256-GCM with a random IV per call. IV + auth tag are stored alongside the
// ciphertext (concatenated, base64-encoded) so a single string round-trips through decrypt().
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
