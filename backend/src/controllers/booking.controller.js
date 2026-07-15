// Single-resource booking actions (get/update/delete own booking), creation, the admin
// lifecycle state machine, and the customer-only cancel endpoint.

const mongoose = require('mongoose');
const { z } = require('zod');
const Booking = require('../models/Booking');
const Equipment = require('../models/Equipment');
const HttpError = require('../utils/HttpError');
const { pick } = require('../utils/pick');

// Bookings that still consume capacity. Deliberately broader than just "approved/active":
// nothing in this system re-checks capacity at approval time (Phase 19's approve endpoint
// is a plain status transition), so if a merely-*pending* request didn't also count here,
// an admin could approve more overlapping requests than the equipment actually has —
// pending has to hold a tentative claim on inventory for the "no overselling" guarantee to
// actually mean anything end to end. Terminal/inert states (rejected, cancelled, no_show,
// returned) release the hold.
const BLOCKING_STATUSES = ['pending', 'approved', 'active'];

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

async function getBooking(req, res) {
  return res.status(200).json({ booking: req.resource });
}

async function updateBooking(req, res, next) {
  try {
    const { customerNote } = req.body || {};
    if (customerNote === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // Explicit whitelist: status changes only ever happen through dedicated admin/cancel
    // endpoints (Phase 19), never through this general update route.
    req.resource.customerNote = customerNote;
    await req.resource.save();

    return res.status(200).json({ booking: req.resource });
  } catch (err) {
    next(err);
  }
}

async function deleteBooking(req, res, next) {
  try {
    await req.resource.deleteOne();
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings — customer creates a booking request (starts 'pending').
//
// Safe under concurrency: the overlap check and the insert run inside one MongoDB
// transaction, but that alone isn't sufficient — two concurrent transactions inserting two
// *different* new Booking documents don't naturally conflict with each other under
// MongoDB's document-level write-conflict detection, even though both computed their
// "is there capacity" answer from the same (stale, as of the loser's read) overlap count.
// That's classic write skew: both transactions can see "0 conflicting bookings" and both
// commit, overselling the last unit. To prevent it, the transaction's first write is an
// increment on Equipment.reservationVersion — a field with no meaning of its own, whose
// only job is to make every concurrent booking attempt for the same equipment contend over
// the same document. Whichever transaction loses that race gets a transient write-conflict
// error, which the driver's withTransaction() catches and retries automatically — the retry
// re-reads the overlap count fresh (now including the winner's just-committed booking) and
// correctly finds there's no capacity left.
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
        // Atomic fetch + version bump in one op — this is the contention point described
        // above. Must happen before the overlap read below so a retry re-reads fresh data.
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

    return res.status(201).json({ booking: createdBooking });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

// Customer-only cancellation — deliberately a separate endpoint from updateBooking above,
// restricted to 'pending' bookings only. Once a booking is approved, cancelling it needs
// admin coordination (the equipment may already be set aside), so this intentionally
// doesn't extend to any other status.
async function cancelBooking(req, res, next) {
  try {
    if (req.resource.status !== 'pending') {
      return res.status(409).json({
        error: `Cannot cancel a booking with status '${req.resource.status}' (only pending bookings can be cancelled)`,
      });
    }

    req.resource.status = 'cancelled';
    await req.resource.save();

    return res.status(200).json({ booking: req.resource });
  } catch (err) {
    next(err);
  }
}

// Admin lifecycle state machine. Each named transition is only legal from one specific
// starting status:
//   approve:      pending  -> approved
//   reject:       pending  -> rejected
//   markActive:   approved -> active      (pickup)
//   markNoShow:   approved -> no_show     (never picked up)
//   markReturned: active   -> returned
// Anything else (e.g. mark-returned on a booking that was never active, or approving an
// already-approved booking) is rejected with 409 rather than silently no-op'd or coerced —
// the state machine's whole point is that Booking.status can't be jumped to an arbitrary
// value, only walked one defined edge at a time. decidedBy/decidedAt are stamped on every
// transition below (not just approve/reject) so there's always a record of which admin last
// acted on a booking.
function makeTransitionHandler(from, to, extraFields = []) {
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

      return res.status(200).json({ booking });
    } catch (err) {
      if (err.name === 'CastError') {
        return res.status(404).json({ error: 'Booking not found' });
      }
      next(err);
    }
  };
}

const approveBooking = makeTransitionHandler('pending', 'approved');
const rejectBooking = makeTransitionHandler('pending', 'rejected');
const markActive = makeTransitionHandler('approved', 'active');
const markNoShow = makeTransitionHandler('approved', 'no_show');
const markReturned = makeTransitionHandler('active', 'returned', ['conditionOnReturn']);

module.exports = {
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
