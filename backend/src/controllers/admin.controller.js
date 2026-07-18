const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const SecurityAlert = require('../models/SecurityAlert');
const { logAudit } = require('../middleware/auditLogger');
const monitoringService = require('../services/monitoringService');
const logger = require('../utils/logger');
const { escapeRegExp } = require('../utils/escapeRegExp');

const ALLOWED_ROLES = ['customer', 'admin'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

    await logAudit({
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

async function listAuditLogs(req, res, next) {
  try {
    const filter = {};

    if (typeof req.query.action === 'string' && req.query.action.trim()) {
      filter.action = { $regex: escapeRegExp(req.query.action.trim()), $options: 'i' };
    }
    if (typeof req.query.actorId === 'string' && mongoose.isValidObjectId(req.query.actorId)) {
      filter.actorId = req.query.actorId;
    }

    const timestamp = {};
    if (typeof req.query.from === 'string') {
      const fromDate = new Date(req.query.from);
      if (!Number.isNaN(fromDate.getTime())) timestamp.$gte = fromDate;
    }
    if (typeof req.query.to === 'string') {
      const toDate = new Date(req.query.to);
      if (!Number.isNaN(toDate.getTime())) timestamp.$lte = toDate;
    }
    if (Object.keys(timestamp).length > 0) {
      filter.timestamp = timestamp;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorId', 'name email'),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      auditLogs: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function listAlerts(req, res, next) {
  try {
    const filter = {};
    if (typeof req.query.resolved === 'string' && ['true', 'false'].includes(req.query.resolved)) {
      filter.resolved = req.query.resolved === 'true';
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const [alerts, total] = await Promise.all([
      SecurityAlert.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SecurityAlert.countDocuments(filter),
    ]);

    return res.status(200).json({
      alerts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const alert = await SecurityAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alert.resolved = true;
    await alert.save();

    try {
      await monitoringService.clearAlertCooldown(alert.ip);
    } catch (err) {
      logger.error('Failed to clear alert cooldown', { ip: alert.ip, error: err.message });
    }

    return res.status(200).json({ alert });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Alert not found' });
    }
    next(err);
  }
}

module.exports = { changeUserRole, listAuditLogs, listAlerts, resolveAlert };
