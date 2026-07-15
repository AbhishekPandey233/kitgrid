const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// Fields that must NEVER appear in an audit log entry, regardless of what a caller has
// lying around in scope when it calls logAudit() — an audit trail records WHO did WHAT
// WHEN, it is not a secrets store, and a compromised/over-shared audit log must not be
// equivalent to a compromised credential store:
//   - passwordHash / raw passwords: a leaked audit log must never hand out working
//     credentials, hashed or otherwise.
//   - mfaSecret / mfaSecretEncrypted: same reasoning as passwords — this is authentication
//     material, not an event description.
//   - raw access/refresh/mfa_pending tokens: logging a live bearer token is equivalent to
//     logging a password; anyone who can read the audit log could impersonate the user for
//     as long as that token stays valid.
//   - OTP/TOTP codes: even though a code is only valid for ~30 seconds, logging it at all
//     normalizes writing authentication material into a general-purpose, more widely
//     readable log than the auth system itself.
// This isn't just a convention documented here and hoped for — logAudit()'s parameter list
// below is a fixed, narrow set of fields (actorId, action, resourceType, resourceId, ip,
// userAgent). There is no "details"/"metadata" catch-all a caller could accidentally stuff
// one of the above into; anything not in that list is structurally impossible to persist
// through this function.
async function logAudit({ actorId, action, resourceType, resourceId, ip, userAgent } = {}) {
  try {
    await AuditLog.create({ actorId, action, resourceType, resourceId, ip, userAgent });
  } catch (err) {
    // Audit logging must never break the request it's attached to — record the failure to
    // the application logger (not the audit trail itself) and move on.
    logger.error('Failed to write audit log entry', { action, error: err.message });
  }
}

module.exports = { logAudit };
