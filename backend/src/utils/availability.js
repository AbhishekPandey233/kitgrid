const Booking = require('../models/Booking');

// Bookings in these statuses hold units of equipment against its stock.
const BLOCKING_STATUSES = ['pending', 'approved', 'active'];

// How many units of each equipment are reserved right now. 'active' bookings hold their unit
// from pickup until return regardless of the originally scheduled window (an admin can mark a
// booking active/returned at any time, independent of its dates), so those always count. Only
// 'pending'/'approved' bookings — not yet picked up — are limited to ones whose window covers
// `at`. Returns a Map of equipmentId string -> reserved quantity.
async function getReservedQuantities(equipmentIds, at = new Date(), session) {
  const rows = await Booking.aggregate([
    {
      $match: {
        equipmentId: { $in: equipmentIds },
        $or: [
          { status: 'active' },
          { status: { $in: ['pending', 'approved'] }, startDateTime: { $lte: at }, endDateTime: { $gt: at } },
        ],
      },
    },
    { $group: { _id: '$equipmentId', reserved: { $sum: '$quantity' } } },
  ]).session(session || null);

  return new Map(rows.map((row) => [row._id.toString(), row.reserved]));
}

module.exports = { BLOCKING_STATUSES, getReservedQuantities };
