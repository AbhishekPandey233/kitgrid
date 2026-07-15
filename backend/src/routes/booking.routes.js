const express = require('express');
const Booking = require('../models/Booking');
const { requireAuth } = require('../middleware/auth');
const { requireOwnership } = require('../middleware/ownership');
const {
  getBooking,
  updateBooking,
  deleteBooking,
  createBooking,
  cancelBooking,
} = require('../controllers/booking.controller');

const router = express.Router();

const ownBooking = requireOwnership(Booking, 'id', 'customerId');

router.post('/', requireAuth, createBooking);
router.get('/:id', requireAuth, ownBooking, getBooking);
router.patch('/:id', requireAuth, ownBooking, updateBooking);
router.patch('/:id/cancel', requireAuth, ownBooking, cancelBooking);
router.delete('/:id', requireAuth, ownBooking, deleteBooking);

module.exports = router;
