const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { updateMe } = require('../src/controllers/user.controller');
const { changeUserRole } = require('../src/controllers/admin.controller');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
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
});
