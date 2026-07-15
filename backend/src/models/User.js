const mongoose = require('mongoose');

const { Schema } = mongoose;

const oauthProviderSchema = new Schema(
  {
    provider: { type: String, required: true },
    providerId: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Absent for OAuth-only accounts. select:false keeps it out of default query results.
    passwordHash: { type: String, select: false },
    passwordHistory: { type: [String], default: [], select: false },
    passwordChangedAt: { type: Date },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, select: false },
    oauthProviders: { type: [oauthProviderSchema], default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date },
    // Number of times this account has been locked out consecutively (reset to 0 on a
    // successful login) — drives exponential backoff on the lockout duration.
    lockoutCount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    lastLogin: { type: Date },
    phone: { type: String, default: '', trim: true },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
