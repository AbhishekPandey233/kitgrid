const mongoose = require('mongoose');
const env = require('../src/config/env');
const redisClient = require('../src/config/redis');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { logAudit } = require('../src/middleware/auditLogger');
const { changeUserRole, listAuditLogs } = require('../src/controllers/admin.controller');

// auth.controller.js pulls in middleware/rateLimit.js, which builds a Redis-backed rate
// limiter store at module-load time — that constructor issues a command immediately, so the
// Redis client has to already be (at least) told to connect before this require happens, or
// it throws "the client is closed". Deferred to a dynamic require inside beforeAll below,
// after redisClient.connect() — the same ordering server.js relies on, which no other test
// file needs since none of them require auth.controller.js directly.
let register;
let login;

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
}

describe('logAudit', () => {
  const writtenIds = [];

  afterAll(async () => {
    await AuditLog.deleteMany({ _id: { $in: writtenIds } });
  });

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('writes exactly the documented fields', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const resourceId = new mongoose.Types.ObjectId();

    await logAudit({
      actorId,
      action: 'test.event',
      resourceType: 'Test',
      resourceId,
      ip: '127.0.0.1',
      userAgent: 'jest-test-agent',
    });

    const entry = await AuditLog.findOne({ action: 'test.event', resourceId });
    writtenIds.push(entry._id);

    expect(entry.actorId.toString()).toBe(actorId.toString());
    expect(entry.resourceType).toBe('Test');
    expect(entry.ip).toBe('127.0.0.1');
    expect(entry.userAgent).toBe('jest-test-agent');
    expect(entry.timestamp).toBeTruthy();
  });

  test('structurally cannot persist a field outside its fixed parameter list', async () => {
    const resourceId = new mongoose.Types.ObjectId();

    // Simulates a careless call site trying to pass secret material through — logAudit's
    // destructured parameter list has no slot for any of these, so they're dropped before
    // AuditLog.create() is ever called, not merely "not written by convention".
    await logAudit({
      action: 'test.leak_attempt',
      resourceType: 'Test',
      resourceId,
      passwordHash: '$2a$12$shouldneverappear',
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      token: 'eyJhbGciOiJIUzI1NiJ9.leaked.token',
      otpCode: '123456',
    });

    const entry = await AuditLog.findOne({ action: 'test.leak_attempt', resourceId });
    writtenIds.push(entry._id);

    const rawKeys = Object.keys(entry.toObject());
    expect(rawKeys).not.toContain('passwordHash');
    expect(rawKeys).not.toContain('mfaSecret');
    expect(rawKeys).not.toContain('token');
    expect(rawKeys).not.toContain('otpCode');
    expect(JSON.stringify(entry)).not.toContain('shouldneverappear');
    expect(JSON.stringify(entry)).not.toContain('JBSWY3DPEHPK3PXP');
  });

  test('never throws even when the write itself fails', async () => {
    // resourceId given as an invalid type causes AuditLog.create() to reject with a
    // CastError — logAudit must swallow it, not propagate it into the caller's request.
    await expect(
      logAudit({ action: 'test.bad_write', resourceType: 'Test', resourceId: 'not-a-valid-object-id' })
    ).resolves.toBeUndefined();
  });
});

describe('audit trail is actually wired into real events', () => {
  let admin;
  let target;
  const stamp = Date.now();
  const userIds = [];

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    await redisClient.connect();
    ({ register, login } = require('../src/controllers/auth.controller'));

    admin = await User.create({ name: 'Audit Admin', email: `audit-admin-${stamp}@example.com`, passwordHash: 'x', role: 'admin' });
    target = await User.create({ name: 'Audit Target', email: `audit-target-${stamp}@example.com`, passwordHash: 'x' });
    userIds.push(admin._id, target._id);
  });

  afterAll(async () => {
    await AuditLog.deleteMany({ actorId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
    await redisClient.quit();
  });

  test('registration writes an audit.register entry', async () => {
    const email = `audit-register-${stamp}@example.com`;
    const req = { body: { name: 'New Registrant', email, password: 'Tr0ub4dor&Zebra!' }, ip: '127.0.0.1', headers: {} };
    const res = mockRes();
    await register(req, res, jest.fn());

    expect(res._status).toBe(201);
    const user = await User.findOne({ email });
    userIds.push(user._id);

    const entry = await AuditLog.findOne({ action: 'auth.register', resourceId: user._id });
    expect(entry).toBeTruthy();
  });

  test('a failed login writes an auth.login_failure entry with no credential material', async () => {
    const req = { body: { email: target.email, password: 'definitely-wrong' }, ip: '127.0.0.1', headers: {} };
    const res = mockRes();
    await login(req, res, jest.fn());

    expect(res._status).toBe(401);
    const entry = await AuditLog.findOne({ action: 'auth.login_failure', resourceId: target._id });
    expect(entry).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain('definitely-wrong');
  });

  test('a role change writes a user.role_changed entry', async () => {
    const req = { user: admin, params: { id: target._id.toString() }, body: { role: 'admin' }, ip: '127.0.0.1', headers: {} };
    const res = mockRes();
    await changeUserRole(req, res, jest.fn());

    expect(res._status).toBe(200);
    const entry = await AuditLog.findOne({ action: 'user.role_changed', resourceId: target._id });
    expect(entry).toBeTruthy();
    expect(entry.actorId.toString()).toBe(admin._id.toString());
  });
});

describe('GET /api/admin/audit-logs', () => {
  const stamp = Date.now();
  const actorId = new mongoose.Types.ObjectId();
  const entryIds = [];

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    const older = await AuditLog.create({ actorId, action: 'test.listing_a', resourceType: 'Test', timestamp: new Date(Date.now() - 60_000) });
    const newer = await AuditLog.create({ actorId, action: 'test.listing_b', resourceType: 'Test', timestamp: new Date() });
    entryIds.push(older._id, newer._id);
  });

  afterAll(async () => {
    await AuditLog.deleteMany({ _id: { $in: entryIds } });
    await mongoose.disconnect();
  });

  test('lists with pagination, newest first', async () => {
    const req = { query: { actorId: actorId.toString() } };
    const res = mockRes();
    await listAuditLogs(req, res, jest.fn());

    expect(res._status).toBe(200);
    expect(res._body.pagination).toEqual(expect.objectContaining({ page: 1 }));
    expect(res._body.auditLogs[0].action).toBe('test.listing_b');
    expect(res._body.auditLogs[1].action).toBe('test.listing_a');
  });

  test('filters by action', async () => {
    const req = { query: { actorId: actorId.toString(), action: 'test.listing_a' } };
    const res = mockRes();
    await listAuditLogs(req, res, jest.fn());

    expect(res._body.auditLogs).toHaveLength(1);
    expect(res._body.auditLogs[0].action).toBe('test.listing_a');
  });

  test('filters by date range (from/to)', async () => {
    const req = { query: { actorId: actorId.toString(), from: new Date(Date.now() - 30_000).toISOString() } };
    const res = mockRes();
    await listAuditLogs(req, res, jest.fn());

    expect(res._body.auditLogs).toHaveLength(1);
    expect(res._body.auditLogs[0].action).toBe('test.listing_b');
  });

  test('an unrecognized actorId filter yields no results rather than throwing', async () => {
    const req = { query: { actorId: 'not-a-valid-object-id' } };
    const res = mockRes();
    const next = jest.fn();
    await listAuditLogs(req, res, next);

    expect(res._status).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });
});
