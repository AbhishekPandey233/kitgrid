const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

async function logAudit({ actorId, action, resourceType, resourceId, ip, userAgent } = {}) {
  try {
    await AuditLog.create({ actorId, action, resourceType, resourceId, ip, userAgent });
  } catch (err) {
    logger.error('Failed to write audit log entry', { action, error: err.message });
  }
}

module.exports = { logAudit };
