const mongoose = require('mongoose');

const { Schema } = mongoose;

const equipmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, trim: true },
    quantityAvailable: { type: Number, required: true, min: 0 },
    photos: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

equipmentSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
