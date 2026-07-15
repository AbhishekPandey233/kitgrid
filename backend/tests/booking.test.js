const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Equipment = require('../src/models/Equipment');
const Booking = require('../src/models/Booking');
const {
  createBooking,
  updateBooking,
  cancelBooking,
  approveBooking,
  rejectBooking,
  markActive,
  markNoShow,
  markReturned,
} = require('../src/controllers/booking.controller');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 3600_000);
}

describe('POST /api/bookings', () => {
  let customerA;
  let customerB;
  const stamp = Date.now();
  const equipmentIds = [];
  const bookingIds = [];

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    customerA = await User.create({ name: 'Booking Customer A', email: `booking-a-${stamp}@example.com`, passwordHash: 'x' });
    customerB = await User.create({ name: 'Booking Customer B', email: `booking-b-${stamp}@example.com`, passwordHash: 'x' });
  });

  afterAll(async () => {
    await Booking.deleteMany({ _id: { $in: bookingIds } });
    await Equipment.deleteMany({ _id: { $in: equipmentIds } });
    await User.deleteMany({ _id: { $in: [customerA._id, customerB._id] } });
    await mongoose.disconnect();
  });

  describe('validation', () => {
    test('rejects a startDateTime in the past', async () => {
      const equipment = await Equipment.create({ name: 'Past Test', quantityAvailable: 1, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const req = { user: customerA, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(-1), endDateTime: hoursFromNow(2) } };
      const res = mockRes();
      await createBooking(req, res, jest.fn());

      expect(res._status).toBe(400);
    });

    test('rejects startDateTime >= endDateTime', async () => {
      const equipment = await Equipment.create({ name: 'Order Test', quantityAvailable: 1, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const req = { user: customerA, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(5), endDateTime: hoursFromNow(2) } };
      const res = mockRes();
      await createBooking(req, res, jest.fn());

      expect(res._status).toBe(400);
    });

    test('returns 404 for a non-existent equipmentId', async () => {
      const req = {
        user: customerA,
        body: { equipmentId: new mongoose.Types.ObjectId().toString(), startDateTime: hoursFromNow(1), endDateTime: hoursFromNow(2) },
      };
      const res = mockRes();
      await createBooking(req, res, jest.fn());

      expect(res._status).toBe(404);
    });

    test('returns 404 (not a 500) for a malformed equipmentId', async () => {
      const req = { user: customerA, body: { equipmentId: 'not-an-id', startDateTime: hoursFromNow(1), endDateTime: hoursFromNow(2) } };
      const res = mockRes();
      const next = jest.fn();
      await createBooking(req, res, next);

      expect(res._status).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects a retired equipment item', async () => {
      const equipment = await Equipment.create({ name: 'Retired Test', quantityAvailable: 1, status: 'retired', createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const req = { user: customerA, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(1), endDateTime: hoursFromNow(2) } };
      const res = mockRes();
      await createBooking(req, res, jest.fn());

      expect(res._status).toBe(404);
    });
  });

  describe('overlap and capacity', () => {
    test('creates a booking successfully, starting as pending', async () => {
      const equipment = await Equipment.create({ name: 'Basic Drill', quantityAvailable: 2, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const req = {
        user: customerA,
        body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(1), endDateTime: hoursFromNow(3), customerNote: '<script>x</script>fragile' },
      };
      const res = mockRes();
      await createBooking(req, res, jest.fn());

      expect(res._status).toBe(201);
      expect(res._body.booking.status).toBe('pending');
      expect(res._body.booking.customerNote).not.toContain('<script>');
      bookingIds.push(res._body.booking._id);
    });

    test('rejects an overlapping request that would exceed capacity', async () => {
      const equipment = await Equipment.create({ name: 'Single Ladder', quantityAvailable: 1, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      await createBooking(
        { user: customerA, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(10), endDateTime: hoursFromNow(12) } },
        mockRes(),
        jest.fn()
      );

      const req2 = { user: customerB, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(11), endDateTime: hoursFromNow(13) } };
      const res2 = mockRes();
      await createBooking(req2, res2, jest.fn());

      expect(res2._status).toBe(409);

      const bookings = await Booking.find({ equipmentId: equipment._id });
      expect(bookings).toHaveLength(1);
      bookingIds.push(...bookings.map((b) => b._id));
    });

    test('allows a non-overlapping request even at full capacity for a different window', async () => {
      const equipment = await Equipment.create({ name: 'Single Saw', quantityAvailable: 1, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const res1 = mockRes();
      await createBooking(
        { user: customerA, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(20), endDateTime: hoursFromNow(22) } },
        res1,
        jest.fn()
      );
      expect(res1._status).toBe(201);

      const res2 = mockRes();
      await createBooking(
        { user: customerB, body: { equipmentId: equipment._id.toString(), startDateTime: hoursFromNow(30), endDateTime: hoursFromNow(32) } },
        res2,
        jest.fn()
      );
      expect(res2._status).toBe(201);

      const bookings = await Booking.find({ equipmentId: equipment._id });
      expect(bookings).toHaveLength(2);
      bookingIds.push(...bookings.map((b) => b._id));
    });
  });

  describe('concurrency: the last available unit', () => {
    test('two concurrent requests for the last unit — only one succeeds', async () => {
      const equipment = await Equipment.create({ name: 'Only One Generator', quantityAvailable: 1, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const window = { startDateTime: hoursFromNow(50), endDateTime: hoursFromNow(52) };
      const reqA = { user: customerA, body: { equipmentId: equipment._id.toString(), ...window } };
      const reqB = { user: customerB, body: { equipmentId: equipment._id.toString(), ...window } };
      const resA = mockRes();
      const resB = mockRes();

      // Fired together via Promise.all so both hit the DB genuinely concurrently, not
      // sequentially — this is what actually exercises the transaction/retry machinery
      // rather than trivially passing because one request finished before the other began.
      await Promise.all([
        createBooking(reqA, resA, (err) => { throw err; }),
        createBooking(reqB, resB, (err) => { throw err; }),
      ]);

      const statuses = [resA._status, resB._status].sort();
      expect(statuses).toEqual([201, 409]);

      const bookings = await Booking.find({ equipmentId: equipment._id });
      expect(bookings).toHaveLength(1);
      bookingIds.push(...bookings.map((b) => b._id));
    });

    test('ten concurrent requests for a 3-unit item — exactly three succeed', async () => {
      const equipment = await Equipment.create({ name: 'Three Power Washers', quantityAvailable: 3, createdBy: customerA._id });
      equipmentIds.push(equipment._id);

      const window = { startDateTime: hoursFromNow(60), endDateTime: hoursFromNow(62) };
      const attempts = Array.from({ length: 10 }, (_, i) => {
        const req = { user: i % 2 === 0 ? customerA : customerB, body: { equipmentId: equipment._id.toString(), ...window } };
        const res = mockRes();
        return createBooking(req, res, (err) => { throw err; }).then(() => res);
      });

      const results = await Promise.all(attempts);
      const succeeded = results.filter((r) => r._status === 201);
      const rejected = results.filter((r) => r._status === 409);

      expect(succeeded).toHaveLength(3);
      expect(rejected).toHaveLength(7);

      const bookings = await Booking.find({ equipmentId: equipment._id });
      expect(bookings).toHaveLength(3);
      bookingIds.push(...bookings.map((b) => b._id));
    });
  });
});

describe('Booking lifecycle (admin state machine + customer cancel)', () => {
  let customer;
  let admin;
  let equipment;
  const stamp = Date.now();
  const bookingIds = [];

  function mockRes() {
    return {
      status(s) { this._status = s; return this; },
      json(b) { this._body = b; return this; },
    };
  }

  async function freshPendingBooking() {
    const booking = await Booking.create({
      equipmentId: equipment._id,
      customerId: customer._id,
      startDateTime: hoursFromNow(200),
      endDateTime: hoursFromNow(202),
    });
    bookingIds.push(booking._id);
    return booking;
  }

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    customer = await User.create({ name: 'Lifecycle Customer', email: `lifecycle-cust-${stamp}@example.com`, passwordHash: 'x' });
    admin = await User.create({ name: 'Lifecycle Admin', email: `lifecycle-admin-${stamp}@example.com`, passwordHash: 'x', role: 'admin' });
    equipment = await Equipment.create({ name: 'Lifecycle Gear', quantityAvailable: 5, createdBy: admin._id });
  });

  afterAll(async () => {
    await Booking.deleteMany({ _id: { $in: bookingIds } });
    await Equipment.deleteMany({ _id: equipment._id });
    await User.deleteMany({ _id: { $in: [customer._id, admin._id] } });
    await mongoose.disconnect();
  });

  test('full happy path: pending -> approved -> active -> returned, stamping decidedBy/decidedAt each step', async () => {
    const booking = await freshPendingBooking();

    const approveRes = mockRes();
    await approveBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, approveRes, jest.fn());
    expect(approveRes._status).toBe(200);
    expect(approveRes._body.booking.status).toBe('approved');
    expect(approveRes._body.booking.decidedBy.toString()).toBe(admin._id.toString());
    expect(approveRes._body.booking.decidedAt).toBeTruthy();

    const activeRes = mockRes();
    await markActive({ params: { id: booking._id.toString() }, user: admin, body: {} }, activeRes, jest.fn());
    expect(activeRes._status).toBe(200);
    expect(activeRes._body.booking.status).toBe('active');

    const returnedRes = mockRes();
    await markReturned(
      { params: { id: booking._id.toString() }, user: admin, body: { conditionOnReturn: 'minor scratch on housing' } },
      returnedRes,
      jest.fn()
    );
    expect(returnedRes._status).toBe(200);
    expect(returnedRes._body.booking.status).toBe('returned');
    expect(returnedRes._body.booking.conditionOnReturn).toBe('minor scratch on housing');
  });

  test('reject path: pending -> rejected', async () => {
    const booking = await freshPendingBooking();
    const res = mockRes();
    await rejectBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, res, jest.fn());

    expect(res._status).toBe(200);
    expect(res._body.booking.status).toBe('rejected');
  });

  test('no-show path: pending -> approved -> no_show', async () => {
    const booking = await freshPendingBooking();
    await approveBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, mockRes(), jest.fn());

    const res = mockRes();
    await markNoShow({ params: { id: booking._id.toString() }, user: admin, body: {} }, res, jest.fn());

    expect(res._status).toBe(200);
    expect(res._body.booking.status).toBe('no_show');
  });

  describe('invalid transitions are rejected, not coerced', () => {
    test('cannot mark-returned a booking that was never active', async () => {
      const booking = await freshPendingBooking();
      const res = mockRes();
      await markReturned({ params: { id: booking._id.toString() }, user: admin, body: {} }, res, jest.fn());

      expect(res._status).toBe(409);
      const reloaded = await Booking.findById(booking._id);
      expect(reloaded.status).toBe('pending');
    });

    test('cannot approve an already-approved booking', async () => {
      const booking = await freshPendingBooking();
      await approveBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, mockRes(), jest.fn());

      const res = mockRes();
      await approveBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, res, jest.fn());

      expect(res._status).toBe(409);
    });

    test('cannot mark-active a booking that was never approved', async () => {
      const booking = await freshPendingBooking();
      const res = mockRes();
      await markActive({ params: { id: booking._id.toString() }, user: admin, body: {} }, res, jest.fn());

      expect(res._status).toBe(409);
    });
  });

  describe('customer /cancel', () => {
    test('customer can cancel their own pending booking', async () => {
      const booking = await freshPendingBooking();
      const res = mockRes();
      await cancelBooking({ resource: booking }, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.booking.status).toBe('cancelled');
    });

    test('customer cannot cancel a booking that is no longer pending', async () => {
      const booking = await freshPendingBooking();
      await approveBooking({ params: { id: booking._id.toString() }, user: admin, body: {} }, mockRes(), jest.fn());
      const approved = await Booking.findById(booking._id);

      const res = mockRes();
      await cancelBooking({ resource: approved }, res, jest.fn());

      expect(res._status).toBe(409);
      const reloaded = await Booking.findById(booking._id);
      expect(reloaded.status).toBe('approved');
    });
  });

  describe('the general PATCH /api/bookings/:id route can never touch status', () => {
    test("a customer PATCHing status: 'approved' on their own pending booking via the general update route has no effect", async () => {
      const booking = await freshPendingBooking();

      const req = { resource: booking, body: { customerNote: 'still mine', status: 'approved' } };
      const res = mockRes();
      const next = jest.fn();

      await updateBooking(req, res, next);

      expect(res._status).toBe(200);
      expect(next).not.toHaveBeenCalled();

      const reloaded = await Booking.findById(booking._id);
      expect(reloaded.status).toBe('pending'); // unchanged — silently ignored
      expect(reloaded.customerNote).toBe('still mine'); // the actually-whitelisted field DID update
    });
  });
});
