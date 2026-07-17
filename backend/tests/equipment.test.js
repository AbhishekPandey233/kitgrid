const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Equipment = require('../src/models/Equipment');
const {
  listEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} = require('../src/controllers/equipment.controller');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
    send(b) { this._body = b; return this; },
  };
}

describe('Equipment CRUD (admin)', () => {
  let admin;
  const stamp = Date.now();
  const createdIds = [];

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    admin = await User.create({
      name: 'Equipment Admin',
      email: `equipment-admin-${stamp}@example.com`,
      passwordHash: 'x',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await Equipment.deleteMany({ _id: { $in: createdIds } });
    await User.deleteMany({ _id: admin._id });
    await mongoose.disconnect();
  });

  describe('createEquipment', () => {
    test('rejects negative quantityAvailable', async () => {
      const req = { user: admin, body: { name: 'Bad Drill', quantityAvailable: -1 } };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(400);
      expect(res._body.details.join(' ')).toMatch(/quantityAvailable/);
    });

    test('rejects a missing required field (name)', async () => {
      const req = { user: admin, body: { quantityAvailable: 3 } };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(400);
    });

    test('rejects an unexpected field', async () => {
      const req = { user: admin, body: { name: 'Drill', quantityAvailable: 1, notAField: 'x' } };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(400);
    });

    test('rejects a non-URL photo', async () => {
      const req = { user: admin, body: { name: 'Drill', quantityAvailable: 1, photos: ['not-a-url'] } };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(400);
    });

    test('rejects a client-supplied createdBy outright (strict schema has no such field)', async () => {
      const req = {
        user: admin,
        body: { name: 'Drill', quantityAvailable: 1, createdBy: 'attacker-supplied-id' },
      };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('creates equipment, sanitizes description, sets createdBy from the server', async () => {
      const req = {
        user: admin,
        ip: '127.0.0.1',
        headers: {},
        body: {
          name: 'Cordless Drill',
          description: '<script>alert(1)</script>18V, includes battery',
          category: 'Power Tools',
          quantityAvailable: 5,
          photos: ['https://example.com/drill.jpg'],
        },
      };
      const res = mockRes();
      const next = jest.fn();

      await createEquipment(req, res, next);

      expect(res._status).toBe(201);
      expect(res._body.equipment.description).not.toContain('<script>');
      expect(res._body.equipment.description).toContain('18V, includes battery');
      expect(res._body.equipment.createdBy.toString()).toBe(admin._id.toString());
      createdIds.push(res._body.equipment._id);
    });
  });

  describe('listEquipment', () => {
    let active;
    let retired;

    beforeAll(async () => {
      active = await Equipment.create({ name: 'Active Ladder', category: 'Ladders', quantityAvailable: 2, status: 'active', createdBy: admin._id });
      retired = await Equipment.create({ name: 'Retired Ladder', category: 'Ladders', quantityAvailable: 0, status: 'retired', createdBy: admin._id });
      createdIds.push(active._id, retired._id);
    });

    test('lists with pagination metadata', async () => {
      const req = { query: {} };
      const res = mockRes();
      await listEquipment(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.pagination).toEqual(expect.objectContaining({ page: 1 }));
      expect(Array.isArray(res._body.equipment)).toBe(true);
    });

    test('filters by status', async () => {
      const req = { query: { status: 'retired', category: 'Ladders' } };
      const res = mockRes();
      await listEquipment(req, res, jest.fn());

      const ids = res._body.equipment.map((e) => e._id.toString());
      expect(ids).toContain(retired._id.toString());
      expect(ids).not.toContain(active._id.toString());
    });

    test('a NoSQL injection payload in the category filter is neutralized, not thrown', async () => {
      const req = { query: { category: { $ne: null } } };
      const res = mockRes();
      const next = jest.fn();

      await listEquipment(req, res, next);

      expect(res._status).toBe(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('updateEquipment / deleteEquipment', () => {
    let item;

    beforeEach(async () => {
      item = await Equipment.create({ name: 'Update Target', quantityAvailable: 1, createdBy: admin._id });
      createdIds.push(item._id);
    });

    test('updates fields and re-sanitizes description', async () => {
      const req = {
        user: admin,
        ip: '127.0.0.1',
        headers: {},
        params: { id: item._id.toString() },
        body: { description: '<img src=x onerror=alert(1)>Now with description' },
      };
      const res = mockRes();
      await updateEquipment(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.equipment.description).not.toContain('onerror');
      expect(res._body.equipment.description).toContain('Now with description');
    });

    test('rejects negative quantityAvailable on update', async () => {
      const req = { params: { id: item._id.toString() }, body: { quantityAvailable: -5 } };
      const res = mockRes();
      await updateEquipment(req, res, jest.fn());

      expect(res._status).toBe(400);
    });

    test('returns 404 for a non-existent id', async () => {
      const req = { params: { id: new mongoose.Types.ObjectId().toString() }, body: { name: 'X' } };
      const res = mockRes();
      await updateEquipment(req, res, jest.fn());

      expect(res._status).toBe(404);
    });

    test('returns 404 (not a 500) for a malformed id', async () => {
      const req = { params: { id: 'not-an-id' }, body: { name: 'X' } };
      const res = mockRes();
      const next = jest.fn();
      await updateEquipment(req, res, next);

      expect(res._status).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    test('deletes equipment', async () => {
      const req = { user: admin, ip: '127.0.0.1', headers: {}, params: { id: item._id.toString() } };
      const res = mockRes();
      await deleteEquipment(req, res, jest.fn());

      expect(res._status).toBe(204);
      const gone = await Equipment.findById(item._id);
      expect(gone).toBeNull();
    });
  });
});
