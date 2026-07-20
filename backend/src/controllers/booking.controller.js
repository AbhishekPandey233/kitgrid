
const mongoose = require('mongoose');
const { z } = require('zod');
const Booking = require('../models/Booking');
const Equipment = require('../models/Equipment');
const HttpError = require('../utils/HttpError');
const { pick } = require('../utils/pick');
const { logAudit } = require('../middleware/auditLogger');
const { BLOCKING_STATUSES } = require('../utils/availability');

const dateSchema = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), { message: 'must be a valid date' });

const createBookingSchema = z
  .object({
    equipmentId: z.string().min(1, 'equipmentId is required'),
    startDateTime: dateSchema,
    endDateTime: dateSchema,
    quantity: z.number().int().min(1).max(1000).optional(),
    customerNote: z.string().trim().max(2000).optional(),
  })
  .strict();

function formatZodError(error) {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

const MY_BOOKINGS_LIMIT = 50;

const ADMIN_LIST_DEFAULT_PAGE_SIZE = 20;
const ADMIN_LIST_MAX_PAGE_SIZE = 100;
const BOOKING_STATUS_VALUES = Booking.schema.path('status').enumValues;

async function listAllBookings(req, res, next) {
  try {
    const filter = {};
    if (typeof req.query.status === 'string' && BOOKING_STATUS_VALUES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || ADMIN_LIST_DEFAULT_PAGE_SIZE, 1),
      ADMIN_LIST_MAX_PAGE_SIZE
    );

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('equipmentId', 'name category photos')
        .populate('customerId', 'name email'),
      Booking.countDocuments(filter),
    ]);

    return res.status(200).json({
      bookings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function listMyBookings(req, res, next) {
  try {
    const bookings = await Booking.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(MY_BOOKINGS_LIMIT)
      .populate('equipmentId', 'name category photos description quantityAvailable');

    return res.status(200).json({ bookings });
  } catch (err) {
    next(err);
  }
}

async function getBooking(req, res) {
  return res.status(200).json({ booking: req.resource });
}

async function updateBooking(req, res, next) {
  try {
    const { customerNote } = req.body || {};
    if (customerNote === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    req.resource.customerNote = customerNote;
    await req.resource.save();

    return res.status(200).json({ booking: req.resource });
  } catch (err) {
    next(err);
  }
}

async function deleteBooking(req, res, next) {
  try {
    if (req.resource.status !== 'returned') {
      return res.status(409).json({
        error: `Cannot delete a booking with status '${req.resource.status}' (only returned bookings can be deleted)`,
      });
    }

    await req.resource.deleteOne();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function createBooking(req, res, next) {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid booking request', details: formatZodError(parsed.error) });
    }

    const { equipmentId, startDateTime, endDateTime, customerNote } = parsed.data;
    const quantity = parsed.data.quantity ?? 1;

    if (!mongoose.isValidObjectId(equipmentId)) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const now = new Date();
    if (startDateTime <= now) {
      return res.status(400).json({ error: 'startDateTime must be in the future' });
    }
    if (!(startDateTime < endDateTime)) {
      return res.status(400).json({ error: 'startDateTime must be before endDateTime' });
    }

    const session = await mongoose.startSession();
    let createdBooking;

    try {
      await session.withTransaction(async () => {
        const equipment = await Equipment.findOneAndUpdate(
          { _id: equipmentId, status: 'active' },
          { $inc: { reservationVersion: 1 } },
          { session, new: true }
        );
        if (!equipment) {
          throw new HttpError(404, 'Equipment not found');
        }

        const overlapping = await Booking.find({
          equipmentId,
          status: { $in: BLOCKING_STATUSES },
          startDateTime: { $lt: endDateTime },
          endDateTime: { $gt: startDateTime },
        }).session(session);

        const reservedQuantity = overlapping.reduce((sum, b) => sum + (b.quantity || 1), 0);
        if (reservedQuantity + quantity > equipment.quantityAvailable) {
          throw new HttpError(409, 'Not enough units available for the requested time window');
        }

        const [booking] = await Booking.create(
          [
            {
              equipmentId,
              customerId: req.user._id,
              startDateTime,
              endDateTime,
              quantity,
              customerNote: customerNote || '',
            },
          ],
          { session }
        );
        createdBooking = booking;
      });
    } finally {
      await session.endSession();
    }

    await logAudit({
      actorId: req.user._id,
      action: 'booking.created',
      resourceType: 'Booking',
      resourceId: createdBooking._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({ booking: createdBooking });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

async function cancelBooking(req, res, next) {
  try {
    if (req.resource.status !== 'pending') {
      return res.status(409).json({
        error: `Cannot cancel a booking with status '${req.resource.status}' (only pending bookings can be cancelled)`,
      });
    }

    req.resource.status = 'cancelled';
    await req.resource.save();

    await logAudit({
      actorId: req.user._id,
      action: 'booking.cancelled',
      resourceType: 'Booking',
      resourceId: req.resource._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({ booking: req.resource });
  } catch (err) {
    next(err);
  }
}

function makeTransitionHandler(from, to, { extraFields = [], auditAction } = {}) {
  return async function transition(req, res, next) {
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      if (booking.status !== from) {
        return res.status(409).json({
          error: `Cannot transition booking from '${booking.status}' to '${to}' (expected '${from}')`,
        });
      }

      const updates = pick(req.body || {}, ['adminNote', ...extraFields]);
      Object.assign(booking, updates);

      booking.status = to;
      booking.decidedBy = req.user._id;
      booking.decidedAt = new Date();

      await booking.save();

      if (auditAction) {
        await logAudit({
          actorId: req.user._id,
          action: auditAction,
          resourceType: 'Booking',
          resourceId: booking._id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      return res.status(200).json({ booking });
    } catch (err) {
      if (err.name === 'CastError') {
        return res.status(404).json({ error: 'Booking not found' });
      }
      next(err);
    }
  };
}

const approveBooking = makeTransitionHandler('pending', 'approved', { auditAction: 'booking.approved' });
const rejectBooking = makeTransitionHandler('pending', 'rejected', { auditAction: 'booking.rejected' });
const markActive = makeTransitionHandler('approved', 'active');
const markNoShow = makeTransitionHandler('approved', 'no_show');
const markReturned = makeTransitionHandler('active', 'returned', { extraFields: ['conditionOnReturn'] });

module.exports = {
  listMyBookings,
  listAllBookings,
  getBooking,
  updateBooking,
  deleteBooking,
  createBooking,
  cancelBooking,
  approveBooking,
  rejectBooking,
  markActive,
  markNoShow,
  markReturned,
};
