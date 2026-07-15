// Single-resource booking actions (get/update/delete own booking). Booking creation with
// overlap/race-condition handling is Phase 18; admin lifecycle transitions and the proper
// customer /cancel endpoint are Phase 19 — this file grows to hold those too.

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

module.exports = { getBooking, updateBooking, deleteBooking };
