const mongoose = require('mongoose');
const env = require('../src/config/env');
const redisClient = require('../src/config/redis');
const SecurityAlert = require('../src/models/SecurityAlert');
const { recordFailedLoginForAlerting, clearAlertCooldown } = require('../src/services/monitoringService');
const { listAlerts, resolveAlert } = require('../src/controllers/admin.controller');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
}

describe('monitoringService.recordFailedLoginForAlerting', () => {
  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    await redisClient.connect();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await redisClient.quit();
  });

  test('does not alert below the threshold', async () => {
    const ip = `monitor-below-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await recordFailedLoginForAlerting(ip);
    }
    const alert = await SecurityAlert.findOne({ ip });
    expect(alert).toBeNull();
  });

  test('raises exactly one alert once the threshold is crossed', async () => {
    const ip = `monitor-cross-${Date.now()}`;
    for (let i = 0; i < 6; i++) {
      await recordFailedLoginForAlerting(ip);
    }
    const alert = await SecurityAlert.findOne({ ip });
    expect(alert).toBeTruthy();
    expect(alert.type).toBe('brute_force_login');
    expect(alert.resolved).toBe(false);
    expect(alert.details).toContain('6 failed logins');

    await SecurityAlert.deleteMany({ ip });
  });

  test('further failures within the cooldown do not raise a duplicate alert', async () => {
    const ip = `monitor-cooldown-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await recordFailedLoginForAlerting(ip);
    }
    const count = await SecurityAlert.countDocuments({ ip });
    expect(count).toBe(1);

    await SecurityAlert.deleteMany({ ip });
  });

  test('clearing the cooldown allows a fresh alert to fire again', async () => {
    const ip = `monitor-clear-${Date.now()}`;
    for (let i = 0; i < 6; i++) {
      await recordFailedLoginForAlerting(ip);
    }
    expect(await SecurityAlert.countDocuments({ ip })).toBe(1);

    await clearAlertCooldown(ip);

    for (let i = 0; i < 6; i++) {
      await recordFailedLoginForAlerting(ip);
    }
    expect(await SecurityAlert.countDocuments({ ip })).toBe(2);

    await SecurityAlert.deleteMany({ ip });
  });
});

describe('admin alerts endpoints', () => {
  const stamp = Date.now();
  const alertIds = [];

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    await redisClient.connect();
    const a = await SecurityAlert.create({ type: 'brute_force_login', ip: `1.2.3.${stamp % 250}`, details: 'unresolved one' });
    const b = await SecurityAlert.create({ type: 'brute_force_login', ip: `1.2.3.${stamp % 250}`, details: 'unresolved two' });
    const c = await SecurityAlert.create({ type: 'brute_force_login', ip: `1.2.3.${stamp % 250}`, details: 'already resolved', resolved: true });
    alertIds.push(a._id, b._id, c._id);
  });

  afterAll(async () => {
    await SecurityAlert.deleteMany({ _id: { $in: alertIds } });
    await mongoose.disconnect();
    await redisClient.quit();
  });

  test('lists all alerts with pagination', async () => {
    const req = { query: {} };
    const res = mockRes();
    await listAlerts(req, res, jest.fn());

    expect(res._status).toBe(200);
    expect(res._body.pagination).toEqual(expect.objectContaining({ page: 1 }));
    const returnedIds = res._body.alerts.map((a) => a._id.toString());
    expect(returnedIds).toEqual(expect.arrayContaining(alertIds.map(String)));
  });

  test('filters by resolved=false', async () => {
    const req = { query: { resolved: 'false' } };
    const res = mockRes();
    await listAlerts(req, res, jest.fn());

    const details = res._body.alerts.map((a) => a.details);
    expect(details).toContain('unresolved one');
    expect(details).not.toContain('already resolved');
  });

  test('resolveAlert marks an alert resolved', async () => {
    const target = await SecurityAlert.findOne({ details: 'unresolved one' });
    const req = { params: { id: target._id.toString() } };
    const res = mockRes();
    await resolveAlert(req, res, jest.fn());

    expect(res._status).toBe(200);
    expect(res._body.alert.resolved).toBe(true);

    const reloaded = await SecurityAlert.findById(target._id);
    expect(reloaded.resolved).toBe(true);
  });

  test('resolveAlert returns 404 for a non-existent id', async () => {
    const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
    const res = mockRes();
    await resolveAlert(req, res, jest.fn());

    expect(res._status).toBe(404);
  });

  test('resolveAlert returns 404 (not a 500) for a malformed id', async () => {
    const req = { params: { id: 'not-an-id' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveAlert(req, res, next);

    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });
});
