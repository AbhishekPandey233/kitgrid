const mongoose = require('mongoose');
const env = require('../src/config/env');
const redisClient = require('../src/config/redis');
const User = require('../src/models/User');
const tokenService = require('../src/services/tokenService');
const { requireCsrfToken } = require('../src/middleware/csrf');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
}

describe('requireCsrfToken', () => {
  let userA;
  let userB;
  let sessionA;
  let sessionB;
  let refreshCookieA;
  let refreshCookieB;
  let csrfTokenA;

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    await redisClient.connect();

    const stamp = Date.now();
    userA = await User.create({ name: 'CSRF User A', email: `csrf-a-${stamp}@example.com`, passwordHash: 'x' });
    userB = await User.create({ name: 'CSRF User B', email: `csrf-b-${stamp}@example.com`, passwordHash: 'x' });

    const issuedA = await tokenService.issueSession(userA);
    const issuedB = await tokenService.issueSession(userB);
    sessionA = issuedA.sessionId;
    sessionB = issuedB.sessionId;
    refreshCookieA = issuedA.refreshToken;
    refreshCookieB = issuedB.refreshToken;
    csrfTokenA = tokenService.generateCsrfToken(sessionA);
  });

  afterAll(async () => {
    await tokenService.revokeSession(userA._id.toString(), sessionA);
    await tokenService.revokeSession(userB._id.toString(), sessionB);
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();
    await redisClient.quit();
  });

  test('GET requests are never checked, since the method isn\'t state-changing', () => {
    const req = { method: 'GET', path: '/api/bookings/123', cookies: {}, headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('a state-changing request with no CSRF header is rejected with 403', () => {
    const req = {
      method: 'PATCH',
      path: '/api/bookings/123',
      cookies: { refresh_token: refreshCookieA },
      headers: {},
    };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('a valid token for the current session is accepted', () => {
    const req = {
      method: 'PATCH',
      path: '/api/bookings/123',
      cookies: { refresh_token: refreshCookieA },
      headers: { 'x-csrf-token': csrfTokenA },
    };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("a token generated for one session is rejected alongside a different session's cookie", () => {
    const req = {
      method: 'PATCH',
      path: '/api/bookings/123',
      cookies: { refresh_token: refreshCookieB }, // session B's cookie
      headers: { 'x-csrf-token': csrfTokenA }, // session A's token
    };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('exempt routes (e.g. login) skip the check even with no token at all', () => {
    const req = { method: 'POST', path: '/api/auth/login', cookies: {}, headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('a non-exempt POST route with no session at all is rejected', () => {
    const req = { method: 'POST', path: '/api/auth/mfa/setup', cookies: {}, headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireCsrfToken(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
