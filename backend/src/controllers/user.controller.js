const { z } = require('zod');
const { pick } = require('../utils/pick');
const Booking = require('../models/Booking');

const UPDATABLE_FIELDS = ['name', 'phone', 'notificationPreferences'];
const NOTIFICATION_PREFERENCE_KEYS = ['email', 'sms'];

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
