const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const ALLOWED_ROLES = ['customer', 'admin'];

// Deliberately separate from user.controller.js's updateMe — this is the ONE place in the
// whole app that can ever write User.role, admin-only and independently audited, so a role
// change can never ride along with (or be disguised as) a normal profile self-update.
async function changeUserRole(req, res, next) {
  try {
    const { role } = req.body || {};
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'user.role_changed',
      resourceType: 'User',
      resourceId: targetUser._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('User role changed', {
      actorId: req.user._id.toString(),
      targetUserId: targetUser._id.toString(),
      previousRole,
      newRole: role,
    });

    return res.status(200).json({
      message: 'Role updated',
      user: { id: targetUser._id, role: targetUser.role },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { changeUserRole };
