const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { changeUserRole } = require('../controllers/admin.controller');

const router = express.Router();

router.patch('/users/:id/role', requireAuth, requireRole('admin'), changeUserRole);

module.exports = router;
