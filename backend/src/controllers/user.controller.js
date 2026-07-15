const { pick } = require('../utils/pick');

const UPDATABLE_FIELDS = ['name', 'phone', 'notificationPreferences'];
const NOTIFICATION_PREFERENCE_KEYS = ['email', 'sms'];

// Explicit response shape — built field-by-field rather than trusting whatever req.user
// happens to carry, so passwordHash/mfaSecretEncrypted/passwordHistory (already select:false
// on the schema) can never leak even if some future code path fetches them.
function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    notificationPreferences: user.notificationPreferences,
    mfaEnabled: user.mfaEnabled,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
}

async function getMe(req, res) {
  return res.status(200).json({ user: toSafeUser(req.user) });
}

async function updateMe(req, res, next) {
  try {
    // Explicit whitelist, never a spread of req.body — role/status/mfaEnabled/passwordHash
    // (and anything else not in UPDATABLE_FIELDS) can never reach the document through this
    // handler, regardless of what the client sends. Role changes have their own dedicated,
    // admin-only, separately-audited endpoint (see admin.controller.js) that never shares
    // this code path.
    const updates = pick(req.body || {}, UPDATABLE_FIELDS);

    if (updates.name !== undefined) {
      const trimmedName = String(updates.name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      req.user.name = trimmedName;
    }

    if (updates.phone !== undefined) {
      req.user.phone = String(updates.phone).trim();
    }

    if (updates.notificationPreferences !== undefined) {
      const prefUpdates = pick(updates.notificationPreferences, NOTIFICATION_PREFERENCE_KEYS);
      Object.assign(req.user.notificationPreferences, prefUpdates);
    }

    await req.user.save();

    return res.status(200).json({ user: toSafeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, toSafeUser };
