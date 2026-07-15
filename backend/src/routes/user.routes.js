const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMe, updateMe, exportMe, importMe } = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateMe);
router.get('/me/export', requireAuth, exportMe);
router.post('/me/import', requireAuth, importMe);

module.exports = router;
