const { z } = require('zod');
const Equipment = require('../models/Equipment');
const { logAudit } = require('../middleware/auditLogger');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// photos are pre-uploaded elsewhere and referenced by URL only — no file upload here.
const createEquipmentSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().max(100).optional(),
    quantityAvailable: z
      .number({ invalid_type_error: 'quantityAvailable must be a number' })
      .int('quantityAvailable must be a whole number')
      .min(0, 'quantityAvailable cannot be negative'),
    photos: z.array(z.string().url('each photo must be a valid URL')).max(20).optional(),
    status: z.enum(['active', 'retired']).optional(),
  })
  .strict();

// Same shape, every field optional — but still .strict(), so an update can't smuggle in a
// field (e.g. createdBy) that create() never accepted either.
const updateEquipmentSchema = createEquipmentSchema.partial().strict();

function formatZodError(error) {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

// GET /api/equipment — public, paginated, filterable by category/status. req.query has
// already passed through the global mongoSanitizeMiddleware (Phase 13) which strips $/.
// prefixed keys, and only these two explicit fields are ever read from it here, so nothing
// else in the query string can shape the Mongo filter regardless of what's sent.
async function listEquipment(req, res, next) {
  try {
    const filter = {};

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      filter.category = req.query.category.trim();
    }
    if (typeof req.query.status === 'string' && ['active', 'retired'].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const [items, total] = await Promise.all([
      Equipment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Equipment.countDocuments(filter),
    ]);

    return res.status(200).json({
      equipment: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function getEquipmentById(req, res, next) {
  try {
    const item = await Equipment.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    return res.status(200).json({ equipment: item });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    next(err);
  }
}

async function createEquipment(req, res, next) {
  try {
    const parsed = createEquipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid equipment data', details: formatZodError(parsed.error) });
    }

    // description is sanitized on write regardless, via the schema setter (Phase 13) —
    // this whitelist just makes sure only known fields (plus the server-derived createdBy)
    // ever reach Equipment.create() in the first place.
    const equipment = await Equipment.create({ ...parsed.data, createdBy: req.user._id });

    await logAudit({
      actorId: req.user._id,
      action: 'equipment.created',
      resourceType: 'Equipment',
      resourceId: equipment._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({ equipment });
  } catch (err) {
    next(err);
  }
}

async function updateEquipment(req, res, next) {
  try {
    const parsed = updateEquipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid equipment data', details: formatZodError(parsed.error) });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    Object.assign(equipment, parsed.data);
    await equipment.save();

    await logAudit({
      actorId: req.user._id,
      action: 'equipment.updated',
      resourceType: 'Equipment',
      resourceId: equipment._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({ equipment });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    next(err);
  }
}

async function deleteEquipment(req, res, next) {
  try {
    const equipment = await Equipment.findByIdAndDelete(req.params.id);
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    await logAudit({
      actorId: req.user._id,
      action: 'equipment.deleted',
      resourceType: 'Equipment',
      resourceId: equipment._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(204).send();
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    next(err);
  }
}

module.exports = { listEquipment, getEquipmentById, createEquipment, updateEquipment, deleteEquipment };
