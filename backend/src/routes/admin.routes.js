const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { changeUserRole, listAuditLogs, listAlerts, resolveAlert } = require('../controllers/admin.controller');
const {
  approveBooking,
  rejectBooking,
  markActive,
  markNoShow,
  markReturned,
} = require('../controllers/booking.controller');

const router = express.Router();
const requireAdmin = [requireAuth, requireRole('admin')];

router.patch('/users/:id/role', ...requireAdmin, changeUserRole);

router.patch('/bookings/:id/approve', ...requireAdmin, approveBooking);
router.patch('/bookings/:id/reject', ...requireAdmin, rejectBooking);
router.patch('/bookings/:id/mark-active', ...requireAdmin, markActive);
router.patch('/bookings/:id/mark-returned', ...requireAdmin, markReturned);
router.patch('/bookings/:id/mark-no-show', ...requireAdmin, markNoShow);

router.get('/audit-logs', ...requireAdmin, listAuditLogs);

router.get('/alerts', ...requireAdmin, listAlerts);
router.patch('/alerts/:id/resolve', ...requireAdmin, resolveAlert);

module.exports = router;
