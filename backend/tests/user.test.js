const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const Equipment = require('../src/models/Equipment');
const Booking = require('../src/models/Booking');
const { updateMe, exportMe, importMe } = require('../src/controllers/user.controller');
const { changeUserRole } = require('../src/controllers/admin.controller');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
    setHeader() { return this; },
  };
}

describe('user profile management', () => {
  let user;
  const stamp = Date.now();

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    user = await User.create({
      name: 'Mass Assignment Test',
      email: `mass-assign-${stamp}@example.com`,
      passwordHash: 'x',
      role: 'customer',
    });
  });

  afterAll(async () => {
    await User.deleteMany({ _id: user._id });
    await mongoose.disconnect();
  });

  describe('PATCH /api/users/me (mass-assignment protection)', () => {
    test("a customer PATCHing role: 'admin' into their own profile update is silently ignored", async () => {
      const req = {
        user,
        body: { name: 'Still Me', role: 'admin', status: 'suspended', mfaEnabled: true, passwordHash: 'hacked' },
      };
      const res = mockRes();
      const next = jest.fn();

      await updateMe(req, res, next);

      expect(res._status).toBe(200);
      expect(next).not.toHaveBeenCalled();

      const reloaded = await User.findById(user._id).select('+passwordHash');
      expect(reloaded.role).toBe('customer'); // unchanged, silently ignored
      expect(reloaded.status).toBe('active'); // unchanged
      expect(reloaded.mfaEnabled).toBe(false); // unchanged
      expect(reloaded.passwordHash).toBe('x'); // unchanged
      expect(reloaded.name).toBe('Still Me'); // the actually-whitelisted field DID update
    });

    test('whitelisted fields (name, phone, notificationPreferences) update correctly', async () => {
      const req = {
        user,
        body: { name: 'Updated Name', phone: '555-1234', notificationPreferences: { sms: true } },
      };
      const res = mockRes();
      const next = jest.fn();

      await updateMe(req, res, next);

      expect(res._body.user.name).toBe('Updated Name');
      expect(res._body.user.phone).toBe('555-1234');
      expect(res._body.user.notificationPreferences.sms).toBe(true);
      expect(res._body.user.notificationPreferences.email).toBe(true); // untouched default preserved
    });

    test('an empty name is rejected', async () => {
      const req = { user, body: { name: '   ' } };
      const res = mockRes();
      const next = jest.fn();

      await updateMe(req, res, next);

      expect(res._status).toBe(400);
    });
  });

  describe('PATCH /api/admin/users/:id/role', () => {
    let admin;
    let target;

    beforeAll(async () => {
      admin = await User.create({ name: 'Admin', email: `role-admin-${stamp}@example.com`, passwordHash: 'x', role: 'admin' });
      target = await User.create({ name: 'Target', email: `role-target-${stamp}@example.com`, passwordHash: 'x', role: 'customer' });
    });

    afterAll(async () => {
      await User.deleteMany({ _id: { $in: [admin._id, target._id] } });
      await AuditLog.deleteMany({ resourceId: target._id });
    });

    test('an admin can change a user role and a dedicated audit log entry is created', async () => {
      const req = { user: admin, params: { id: target._id.toString() }, body: { role: 'admin' }, ip: '127.0.0.1', headers: {} };
      const res = mockRes();
      const next = jest.fn();

      await changeUserRole(req, res, next);

      expect(res._status).toBe(200);
      const reloaded = await User.findById(target._id);
      expect(reloaded.role).toBe('admin');

      const auditEntry = await AuditLog.findOne({ resourceId: target._id, action: 'user.role_changed' });
      expect(auditEntry).toBeTruthy();
      expect(auditEntry.actorId.toString()).toBe(admin._id.toString());
      expect(auditEntry.resourceType).toBe('User');
    });

    test('an invalid role value is rejected', async () => {
      const req = { user: admin, params: { id: target._id.toString() }, body: { role: 'superadmin' }, ip: '127.0.0.1', headers: {} };
      const res = mockRes();
      const next = jest.fn();

      await changeUserRole(req, res, next);

      expect(res._status).toBe(400);
    });
  });

  describe('GET /api/users/me/export and POST /api/users/me/import', () => {
    let equipment;
    let booking;

    beforeAll(async () => {
      equipment = await Equipment.create({ name: 'Export Test Gear', quantityAvailable: 1, createdBy: user._id });
      booking = await Booking.create({
        equipmentId: equipment._id,
        customerId: user._id,
        startDateTime: new Date(Date.now() + 3600_000),
        endDateTime: new Date(Date.now() + 7200_000),
        customerNote: 'handle with care',
      });
    });

    afterAll(async () => {
      await Booking.deleteMany({ _id: booking._id });
      await Equipment.deleteMany({ _id: equipment._id });
    });

    test('export excludes sensitive fields and includes the user\'s own booking history', async () => {
      const req = { user };
      const res = mockRes();
      const next = jest.fn();

      await exportMe(req, res, next);

      expect(res._status).toBe(200);
      expect(res._body.account.email).toBe(user.email);
      expect(res._body.account.passwordHash).toBeUndefined();
      expect(res._body.account.mfaSecretEncrypted).toBeUndefined();
      expect(res._body.profile.passwordHash).toBeUndefined();
      expect(res._body.profile.email).toBeUndefined(); // identity info lives under `account`, not `profile`
      expect(res._body.bookings).toHaveLength(1);
      expect(res._body.bookings[0].customerNote).toBe('handle with care');
      expect(res._body.bookings[0].adminNote).toBeUndefined();
    });

    test('re-uploading your own unmodified export succeeds and restores preferences', async () => {
      const exportReq = { user };
      const exportRes = mockRes();
      await exportMe(exportReq, exportRes, jest.fn());
      const exportedFile = exportRes._body;

      // Simulate editing a preference in the exported file before re-importing it, the way
      // a user restoring from an old backup might.
      exportedFile.profile.name = 'Restored From Export';
      exportedFile.profile.notificationPreferences.sms = true;

      const importReq = { user, body: exportedFile };
      const importRes = mockRes();
      const next = jest.fn();

      await importMe(importReq, importRes, next);

      expect(importRes._status).toBe(200);
      expect(next).not.toHaveBeenCalled();
      expect(importRes._body.user.name).toBe('Restored From Export');
      expect(importRes._body.user.notificationPreferences.sms).toBe(true);
    });

    test('import rejects an attempt to inject role/email/password inside profile', async () => {
      const req = {
        user,
        body: {
          profile: { name: 'Attacker', role: 'admin', email: 'new@evil.com', passwordHash: 'hacked' },
        },
      };
      const res = mockRes();
      const next = jest.fn();

      await importMe(req, res, next);

      expect(res._status).toBe(400);

      const reloaded = await User.findById(user._id).select('+passwordHash');
      expect(reloaded.role).toBe('customer');
      expect(reloaded.email).not.toBe('new@evil.com');
      expect(reloaded.passwordHash).toBe('x');
    });

    test('import rejects an unexpected top-level field', async () => {
      const req = { user, body: { profile: { name: 'X' }, extraField: 'should not be allowed' } };
      const res = mockRes();
      const next = jest.fn();

      await importMe(req, res, next);

      expect(res._status).toBe(400);
    });

    test('import rejects a completely malformed payload', async () => {
      const req = { user, body: { notProfile: true } };
      const res = mockRes();
      const next = jest.fn();

      await importMe(req, res, next);

      expect(res._status).toBe(400);
    });
  });
});
