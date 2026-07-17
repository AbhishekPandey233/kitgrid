const mongoose = require('mongoose');
const env = require('../src/config/env');
const redisClient = require('../src/config/redis');
const User = require('../src/models/User');

jest.mock('@simplewebauthn/server', () => {
  const actual = jest.requireActual('@simplewebauthn/server');
  return { ...actual, verifyRegistrationResponse: jest.fn(), verifyAuthenticationResponse: jest.fn() };
});

const webauthn = require('@simplewebauthn/server');

let webauthnRegisterOptions;
let webauthnRegisterVerify;
let webauthnLoginOptions;
let webauthnLoginVerify;

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
    cookie() { return this; },
  };
}

const FAKE_CREDENTIAL_ID = 'fake-credential-id-abc123';
const FAKE_PUBLIC_KEY = new Uint8Array([1, 2, 3, 4, 5]);

describe('webauthn (passkey) auth', () => {
  let user;
  const stamp = Date.now();

  beforeAll(async () => {
    await mongoose.connect(env.dbUri);
    await redisClient.connect();
    ({
      webauthnRegisterOptions,
      webauthnRegisterVerify,
      webauthnLoginOptions,
      webauthnLoginVerify,
    } = require('../src/controllers/auth.controller'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await redisClient.quit();
  });

  beforeEach(async () => {
    user = await User.create({
      name: 'Passkey Test User',
      email: `webauthn-${stamp}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: 'irrelevant-for-these-tests',
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await User.deleteMany({ _id: user._id });
  });

  describe('POST /api/auth/webauthn/register-options', () => {
    test('returns creation options and stashes a challenge in Redis for this user', async () => {
      const req = { user, headers: {} };
      const res = mockRes();
      await webauthnRegisterOptions(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.challenge).toBeTruthy();
      expect(res._body.user.name).toBe(user.email);

      const stored = await redisClient.get(`webauthn_challenge:register:${user._id.toString()}`);
      expect(stored).toBe(res._body.challenge);
    });
  });

  describe('POST /api/auth/webauthn/register-verify', () => {
    test('a verified response is stored as a new credential on the user', async () => {
      const optsReq = { user, headers: {} };
      await webauthnRegisterOptions(optsReq, mockRes(), jest.fn());

      webauthn.verifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: FAKE_CREDENTIAL_ID, publicKey: FAKE_PUBLIC_KEY, counter: 0, transports: ['internal'] },
        },
      });

      const req = { user, body: { response: { id: FAKE_CREDENTIAL_ID }, deviceLabel: 'My Laptop' }, headers: {} };
      const res = mockRes();
      await webauthnRegisterVerify(req, res, jest.fn());

      expect(res._status).toBe(200);

      const reloaded = await User.findById(user._id).select('+webauthnCredentials');
      expect(reloaded.webauthnCredentials).toHaveLength(1);
      expect(reloaded.webauthnCredentials[0].credentialID).toBe(FAKE_CREDENTIAL_ID);
      expect(reloaded.webauthnCredentials[0].deviceLabel).toBe('My Laptop');
    });

    test('is rejected if no registration ceremony was ever started (no stashed challenge)', async () => {
      const req = { user, body: { response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      const res = mockRes();
      await webauthnRegisterVerify(req, res, jest.fn());

      expect(res._status).toBe(400);
      expect(webauthn.verifyRegistrationResponse).not.toHaveBeenCalled();
    });

    test('a failed library verification is rejected and nothing is stored', async () => {
      await webauthnRegisterOptions({ user, headers: {} }, mockRes(), jest.fn());
      webauthn.verifyRegistrationResponse.mockResolvedValue({ verified: false });

      const req = { user, body: { response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      const res = mockRes();
      await webauthnRegisterVerify(req, res, jest.fn());

      expect(res._status).toBe(400);
      const reloaded = await User.findById(user._id).select('+webauthnCredentials');
      expect(reloaded.webauthnCredentials).toHaveLength(0);
    });

    test('the challenge is single-use — replaying register-verify a second time fails', async () => {
      await webauthnRegisterOptions({ user, headers: {} }, mockRes(), jest.fn());
      webauthn.verifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: { credential: { id: FAKE_CREDENTIAL_ID, publicKey: FAKE_PUBLIC_KEY, counter: 0 } },
      });

      const req = { user, body: { response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      await webauthnRegisterVerify(req, mockRes(), jest.fn());

      const secondRes = mockRes();
      await webauthnRegisterVerify(req, secondRes, jest.fn());
      expect(secondRes._status).toBe(400);
    });
  });

  describe('POST /api/auth/webauthn/login-options', () => {
    test('an account with no enrolled passkeys is rejected', async () => {
      const req = { body: { email: user.email }, headers: {} };
      const res = mockRes();
      await webauthnLoginOptions(req, res, jest.fn());

      expect(res._status).toBe(400);
    });

    test('an enrolled account gets request options scoped to its own credential ids', async () => {
      await User.updateOne(
        { _id: user._id },
        { webauthnCredentials: [{ credentialID: FAKE_CREDENTIAL_ID, publicKey: Buffer.from(FAKE_PUBLIC_KEY).toString('base64'), counter: 0 }] }
      );

      const req = { body: { email: user.email }, headers: {} };
      const res = mockRes();
      await webauthnLoginOptions(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.allowCredentials.map((c) => c.id)).toEqual([FAKE_CREDENTIAL_ID]);

      const stored = await redisClient.get(`webauthn_challenge:login:${user._id.toString()}`);
      expect(stored).toBe(res._body.challenge);
    });
  });

  describe('POST /api/auth/webauthn/login-verify', () => {
    beforeEach(async () => {
      await User.updateOne(
        { _id: user._id },
        { webauthnCredentials: [{ credentialID: FAKE_CREDENTIAL_ID, publicKey: Buffer.from(FAKE_PUBLIC_KEY).toString('base64'), counter: 5 }] }
      );
      await webauthnLoginOptions({ body: { email: user.email }, headers: {} }, mockRes(), jest.fn());
    });

    test('a verified assertion logs the user in and bumps the stored counter', async () => {
      webauthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6 },
      });

      const req = { body: { email: user.email, response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      const res = mockRes();
      await webauthnLoginVerify(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.user.email).toBe(user.email);

      const reloaded = await User.findById(user._id).select('+webauthnCredentials');
      expect(reloaded.webauthnCredentials[0].counter).toBe(6);
    });

    test('an unknown credential id in the response is rejected without calling the library', async () => {
      const req = { body: { email: user.email, response: { id: 'not-a-registered-credential' } }, headers: {} };
      const res = mockRes();
      await webauthnLoginVerify(req, res, jest.fn());

      expect(res._status).toBe(401);
      expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled();
    });

    test('a failed library verification is rejected', async () => {
      webauthn.verifyAuthenticationResponse.mockResolvedValue({ verified: false, authenticationInfo: {} });

      const req = { body: { email: user.email, response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      const res = mockRes();
      await webauthnLoginVerify(req, res, jest.fn());

      expect(res._status).toBe(401);
    });

    test('when MFA is also enabled, a verified passkey still only yields an mfaPendingToken, no session', async () => {
      await User.updateOne({ _id: user._id }, { mfaEnabled: true, mfaSecretEncrypted: 'irrelevant' });
      webauthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6 },
      });

      const req = { body: { email: user.email, response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      const res = mockRes();
      await webauthnLoginVerify(req, res, jest.fn());

      expect(res._status).toBe(200);
      expect(res._body.mfaRequired).toBe(true);
      expect(res._body.mfaPendingToken).toBeTruthy();
      expect(res._body.user).toBeUndefined();
    });

    test('the challenge is single-use — replaying login-verify a second time fails', async () => {
      webauthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6 },
      });

      const req = { body: { email: user.email, response: { id: FAKE_CREDENTIAL_ID } }, headers: {} };
      await webauthnLoginVerify(req, mockRes(), jest.fn());

      const secondRes = mockRes();
      await webauthnLoginVerify(req, secondRes, jest.fn());
      expect(secondRes._status).toBe(400);
    });
  });
});
