const { z } = require('zod');
const { pick } = require('../utils/pick');
const Booking = require('../models/Booking');

const UPDATABLE_FIELDS = ['name', 'phone', 'notificationPreferences'];
const NOTIFICATION_PREFERENCE_KEYS = ['email', 'sms'];

// Explicit response shape — built field-by-field rather than trusting whatever req.user
// happens to carry, so passwordHash/mfaSecretEncrypted/passwordHistory (already select:false
// on the schema) can never leak even if some future code path fetches them.
// notificationPreferences is rebuilt as a plain object rather than passed through as-is —
// it's a Mongoose subdocument, and relying on implicit JSON.stringify (via res.json()) to
// flatten it into plain {email, sms} is fragile; anything that consumes this return value
// without going through that serialization step would otherwise see Mongoose internals.
function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    notificationPreferences: {
      email: user.notificationPreferences?.email,
      sms: user.notificationPreferences?.sms,
    },
    mfaEnabled: user.mfaEnabled,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
}

// Shared by PATCH /api/users/me and POST /api/users/me/import — the one place that ever
// applies profile-preference fields onto a User document. Whitelist-based (never a spread),
// so role/status/mfaEnabled/passwordHash can never reach the document through either entry
// point regardless of what the caller sends. Mutates `user` in place; returns validation
// error messages, if any, so callers can decide the HTTP response.
function applyProfileUpdates(user, rawUpdates) {
  const updates = pick(rawUpdates || {}, UPDATABLE_FIELDS);
  const errors = [];

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name).trim();
    if (!trimmedName) {
      errors.push('name cannot be empty');
    } else {
      user.name = trimmedName;
    }
  }

  if (updates.phone !== undefined) {
    user.phone = String(updates.phone).trim();
  }

  if (updates.notificationPreferences !== undefined) {
    const prefUpdates = pick(updates.notificationPreferences, NOTIFICATION_PREFERENCE_KEYS);
    Object.assign(user.notificationPreferences, prefUpdates);
  }

  return errors;
}

async function getMe(req, res) {
  return res.status(200).json({ user: toSafeUser(req.user) });
}

async function updateMe(req, res, next) {
  try {
    // Role changes have their own dedicated, admin-only, separately-audited endpoint (see
    // admin.controller.js) that never shares this code path.
    const errors = applyProfileUpdates(req.user, req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    await req.user.save();

    return res.status(200).json({ user: toSafeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/export
//
// Maps to GDPR Article 20 (right to data portability): the export contains data the user
// provided directly (name, phone, notification preferences, booking notes) and data
// generated through their own use of the service (booking history), in a structured,
// commonly-used, machine-readable format (JSON) — the two conditions Article 20 actually
// requires. It deliberately excludes:
//   - passwordHash, mfaSecretEncrypted, passwordHistory, failedLoginAttempts, lockout
//     state: security-critical internals, never data "provided by" the subject, and
//     exporting them would itself be a security risk (a leaked export shouldn't hand out
//     working credentials).
//   - Booking.adminNote / decidedBy: these are the controller's (KitGrid's) own processing
//     annotations about the user, not data the user provided or generated themselves, so
//     they fall outside Article 20's scope even though they're stored on the same document.
//
// `account` (identity/status info) and `profile` (the editable preferences) are kept as
// separate keys rather than one combined blob — that's what lets POST /import apply a
// strict, minimal schema to `profile` alone: re-uploading your own unmodified export still
// validates, because `profile` in the export only ever contains the same three fields the
// import schema accepts, never the read-only account info alongside them.
async function exportMe(req, res, next) {
  try {
    const bookings = await Booking.find({ customerId: req.user._id })
      .select('equipmentId startDateTime endDateTime status customerNote conditionOnReturn createdAt updatedAt')
      .lean();

    const safeUser = toSafeUser(req.user);
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account: pick(safeUser, ['id', 'email', 'role', 'mfaEnabled', 'status', 'lastLogin', 'createdAt']),
      profile: pick(safeUser, UPDATABLE_FIELDS),
      bookings: bookings.map((b) => ({
        id: b._id,
        equipmentId: b.equipmentId,
        startDateTime: b.startDateTime,
        endDateTime: b.endDateTime,
        status: b.status,
        customerNote: b.customerNote,
        conditionOnReturn: b.conditionOnReturn,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    };

    res.setHeader('Content-Disposition', 'attachment; filename="kitgrid-my-data.json"');
    return res.status(200).json(exportPayload);
  } catch (err) {
    next(err);
  }
}

// Mirrors the shape GET /export produces, so re-uploading your own unmodified export file
// validates successfully — `account`/`bookings`/`exportedAt` are accepted (so a genuine
// export isn't rejected) but never read by the handler below; only `profile` is applied,
// and it's strict-checked against the exact same three-field shape the export itself uses.
// `.strict()` at both levels means any field outside this shape — including role/email/
// passwordHash, whether injected at the top level or inside `profile` — fails validation
// outright rather than being silently dropped.
const importSchema = z
  .object({
    exportedAt: z.unknown().optional(),
    account: z.unknown().optional(),
    bookings: z.unknown().optional(),
    profile: z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        phone: z.string().trim().max(50).optional(),
        notificationPreferences: z
          .object({
            email: z.boolean().optional(),
            sms: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

// POST /api/users/me/import — restores profile preferences only. Bookings and identity
// fields (role, email, password) are never touched, regardless of what the uploaded file
// contains: bookings because that's not this endpoint's job (a booking history isn't
// something you "restore" by re-uploading JSON), and role/email/password because the
// schema above structurally cannot carry them — there's no field for the handler to read
// them from even if validation somehow let one through.
async function importMe(req, res, next) {
  try {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid import file',
        details: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      });
    }

    const errors = applyProfileUpdates(req.user, parsed.data.profile);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    await req.user.save();

    return res.status(200).json({ message: 'Profile preferences restored', user: toSafeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, exportMe, importMe, toSafeUser };
