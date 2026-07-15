const mongoose = require('mongoose');
const { requireRole } = require('../src/middleware/rbac');
const { requireOwnership } = require('../src/middleware/ownership');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Equipment = require('../src/models/Equipment');
const Booking = require('../src/models/Booking');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
}

describe('requireRole', () => {
  test('rejects unauthenticated requests with 401', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a role not in the allow-list with 403', () => {
    const req = { user: { role: 'customer' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows a role in the allow-list through to next()', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeUndefined();
  });

  test('supports multiple allowed roles', () => {
    const req = { user: { role: 'customer' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin', 'customer')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireOwnership (IDOR prevention)', () => {
  let customerA;
  let customerB;
  let admin;
  let equipment;
  let booking;
  const ownBooking = requireOwnership(Booking, 'id', 'customerId');

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);

    const stamp = Date.now();
    customerA = await User.create({ name: 'Customer A', email: `idor-a-${stamp}@example.com`, passwordHash: 'x' });
    customerB = await User.create({ name: 'Customer B', email: `idor-b-${stamp}@example.com`, passwordHash: 'x' });
    admin = await User.create({
      name: 'Admin',
      email: `idor-admin-${stamp}@example.com`,
      passwordHash: 'x',
      role: 'admin',
    });
    equipment = await Equipment.create({ name: 'Drill', quantityAvailable: 1, createdBy: admin._id });
    booking = await Booking.create({
      equipmentId: equipment._id,
      customerId: customerB._id,
      startDateTime: new Date(Date.now() + 3600_000),
      endDateTime: new Date(Date.now() + 7200_000),
    });
  });

  afterAll(async () => {
    await Booking.deleteMany({ _id: booking._id });
    await Equipment.deleteMany({ _id: equipment._id });
    await User.deleteMany({ _id: { $in: [customerA._id, customerB._id, admin._id] } });
    await mongoose.disconnect();
  });

  test("customer A gets 404 on customer B's booking", async () => {
    const req = { params: { id: booking._id.toString() }, user: customerA };
    const res = mockRes();
    const next = jest.fn();

    await ownBooking(req, res, next);

    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('the booking owner is let through, with the resource attached', async () => {
    const req = { params: { id: booking._id.toString() }, user: customerB };
    const res = mockRes();
    const next = jest.fn();

    await ownBooking(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.resource._id.toString()).toBe(booking._id.toString());
  });

  test('an admin is let through regardless of ownership', async () => {
    const req = { params: { id: booking._id.toString() }, user: admin };
    const res = mockRes();
    const next = jest.fn();

    await ownBooking(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('a malformed id returns 404, not a 500', async () => {
    const req = { params: { id: 'not-a-valid-objectid' }, user: customerA };
    const res = mockRes();
    const next = jest.fn();

    await ownBooking(req, res, next);

    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });
});
