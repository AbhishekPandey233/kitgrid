const Booking = require('../models/Booking');

const BLOCKING_STATUSES = ['pending', 'approved', 'active'];

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
