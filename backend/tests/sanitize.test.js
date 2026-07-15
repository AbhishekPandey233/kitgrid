const mongoose = require('mongoose');
const { mongoSanitizeMiddleware, sanitizeHtml } = require('../src/middleware/sanitize');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Equipment = require('../src/models/Equipment');
const Booking = require('../src/models/Booking');

describe('mongoSanitizeMiddleware (NoSQL injection defense)', () => {
  test('a {"$gt": ""} payload in a login-style field is neutralized', () => {
    const req = { body: { email: { $gt: '' }, password: 'x' }, query: {}, params: {} };
    const next = jest.fn();

    mongoSanitizeMiddleware(req, {}, next);

    expect(req.body.email).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('strips $-prefixed operators from req.query too', () => {
    const req = { body: {}, query: { role: { $ne: null } }, params: {} };
    const next = jest.fn();

    mongoSanitizeMiddleware(req, {}, next);

    expect(req.query.role).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('leaves ordinary payloads untouched', () => {
    const req = { body: { email: 'a@example.com', password: 'x' }, query: {}, params: {} };
    const next = jest.fn();

    mongoSanitizeMiddleware(req, {}, next);

    expect(req.body).toEqual({ email: 'a@example.com', password: 'x' });
  });
});

describe('sanitizeHtml', () => {
  test('strips <script> tags and their content entirely', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
  });

  test('strips a script tag embedded in otherwise normal text', () => {
    const result = sanitizeHtml('Please handle with care<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('Please handle with care');
  });

  test('strips attribute-based XSS (e.g. onerror) along with the tag', () => {
    const result = sanitizeHtml('<img src=x onerror=alert(1)>Cordless drill');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<img');
    expect(result).toContain('Cordless drill');
  });

  test('passes plain text through unchanged', () => {
    expect(sanitizeHtml('just a normal note')).toBe('just a normal note');
  });
});

describe('sanitize on write (Mongoose schema setters)', () => {
  let admin;
  const stamp = Date.now();

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    admin = await User.create({
      name: 'Sanitize Test Admin',
      email: `sanitize-admin-${stamp}@example.com`,
      passwordHash: 'x',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await User.deleteMany({ _id: admin._id });
    await mongoose.disconnect();
  });

  test('Booking.customerNote is stripped before being saved', async () => {
    const equipment = await Equipment.create({ name: 'Test Gear', quantityAvailable: 1, createdBy: admin._id });
    const booking = await Booking.create({
      equipmentId: equipment._id,
      customerId: admin._id,
      startDateTime: new Date(Date.now() + 3600_000),
      endDateTime: new Date(Date.now() + 7200_000),
      customerNote: '<script>alert(1)</script>Please handle with care',
    });

    expect(booking.customerNote).not.toContain('<script>');
    expect(booking.customerNote).not.toContain('alert(1)');
    expect(booking.customerNote).toContain('Please handle with care');

    // Confirm it's clean in the DB itself, not just on the in-memory document.
    const reloaded = await Booking.findById(booking._id);
    expect(reloaded.customerNote).not.toContain('<script>');

    await Booking.deleteOne({ _id: booking._id });
    await Equipment.deleteOne({ _id: equipment._id });
  });

  test('Equipment.description is stripped before being saved', async () => {
    const equipment = await Equipment.create({
      name: 'Test Drill',
      description: '<img src=x onerror=alert(1)>Cordless drill',
      quantityAvailable: 1,
      createdBy: admin._id,
    });

    expect(equipment.description).not.toContain('onerror');
    expect(equipment.description).not.toContain('<img');
    expect(equipment.description).toContain('Cordless drill');

    await Equipment.deleteOne({ _id: equipment._id });
  });
});
