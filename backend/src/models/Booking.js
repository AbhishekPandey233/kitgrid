const mongoose = require('mongoose');
const { sanitizeHtml } = require('../middleware/sanitize');

const { Schema } = mongoose;

const bookingSchema = new Schema(
  {
    equipmentId: { type: Schema.Types.ObjectId, ref: 'Equipment', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'active', 'returned', 'no_show', 'cancelled'],
      default: 'pending',
    },
    // Setters run on every assignment, so these are sanitized on write regardless of which
    // controller (customer note update, admin note on approval, etc.) sets them.
    customerNote: { type: String, default: '', set: sanitizeHtml },
    adminNote: { type: String, default: '', set: sanitizeHtml },
    conditionOnReturn: { type: String, default: '' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

// Overlap checks (Phase 18) filter by equipment + date range, so index all three together.
bookingSchema.index({ equipmentId: 1, startDateTime: 1, endDateTime: 1 });
bookingSchema.index({ customerId: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
