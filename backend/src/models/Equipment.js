const mongoose = require('mongoose');
const { sanitizeHtml } = require('../middleware/sanitize');

const { Schema } = mongoose;

const equipmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Setter runs on every assignment (new Equipment(), .create(), doc.description = x),
    // so this is sanitized on write regardless of which controller sets it.
    description: { type: String, default: '', set: sanitizeHtml },
    category: { type: String, trim: true },
    quantityAvailable: { type: Number, required: true, min: 0 },
    photos: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Concurrency control only — has no meaning of its own and is never read by the app.
    // Booking creation (Phase 18) increments it inside a transaction specifically to force
    // a write conflict between two concurrent booking attempts for the same equipment, so
    // MongoDB's transaction retry machinery re-runs the loser's overlap check against
    // fresh data instead of both racers reading a stale "capacity available" snapshot.
    reservationVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

equipmentSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
