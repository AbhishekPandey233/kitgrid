const mongoose = require('mongoose');

const { Schema } = mongoose;

const securityAlertSchema = new Schema(
  {
    type: { type: String, required: true },
    ip: { type: String, required: true },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: false }
);

securityAlertSchema.index({ resolved: 1, timestamp: -1 });
securityAlertSchema.index({ ip: 1 });

module.exports = mongoose.model('SecurityAlert', securityAlertSchema);
