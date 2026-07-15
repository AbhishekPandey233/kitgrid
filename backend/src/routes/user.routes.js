const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getMe, updateMe } = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, updateMe);

module.exports = router;
