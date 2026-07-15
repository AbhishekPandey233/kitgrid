const express = require('express');
const Booking = require('../models/Booking');
const { requireAuth } = require('../middleware/auth');
const { requireOwnership } = require('../middleware/ownership');
const { getBooking, updateBooking, deleteBooking } = require('../controllers/booking.controller');

const router = express.Router();

const ownBooking = requireOwnership(Booking, 'id', 'customerId');

router.get('/:id', requireAuth, ownBooking, getBooking);
router.patch('/:id', requireAuth, ownBooking, updateBooking);
router.delete('/:id', requireAuth, ownBooking, deleteBooking);

module.exports = router;
