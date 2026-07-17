const mongoose = require('mongoose');
const { sanitizeHtml } = require('../middleware/sanitize');

const { Schema } = mongoose;

const bookingSchema = new Schema(
  {
    equipmentId: { type: Schema.Types.ObjectId, ref: 'Equipment', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'active', 'returned', 'no_show', 'cancelled'],
      default: 'pending',
    },
    customerNote: { type: String, default: '', set: sanitizeHtml },
    adminNote: { type: String, default: '', set: sanitizeHtml },
    conditionOnReturn: { type: String, default: '' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ equipmentId: 1, startDateTime: 1, endDateTime: 1 });
bookingSchema.index({ customerId: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
