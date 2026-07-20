const path = require('path');
const fs = require('fs');
const { safeJoin } = require('../src/utils/safePath');
const { UPLOAD_DIR, serveEquipmentImage, SAFE_FILENAME_PATTERN } = require('../src/middleware/upload');

function mockRes() {
  return {
    status(s) { this._status = s; return this; },
    end() { this._ended = true; return this; },
    json(b) { this._body = b; return this; },
    headersSent: false,
    sendFile(filePath, options, cb) {
      this._sentFile = filePath;
      // Mirrors what Express's real res.sendFile(path, { root }) does internally — resolves
      // the given path against root, rather than treating it as already-absolute. Getting
      // this mock wrong (accepting an absolute path directly) is exactly what let the real
      // sendFile/root mismatch bug slip past this test the first time around.
      const resolved = options?.root ? path.resolve(options.root, filePath) : filePath;
      try {
        fs.accessSync(resolved, fs.constants.R_OK);
        this.headersSent = true;
        this._status = this._status || 200;
      } catch (err) {
        cb(err);
      }
    },
  };
}

describe('safeJoin', () => {
  const base = path.join(__dirname, 'fixtures-safepath');

  test('a plain filename within the base directory resolves normally', () => {
    const result = safeJoin(base, 'photo.jpg');
    expect(result).toBe(path.join(base, 'photo.jpg'));
  });

  test('"../" traversal is rejected — resolves outside the base directory', () => {
    expect(safeJoin(base, '../../../etc/passwd')).toBeNull();
    expect(safeJoin(base, '..')).toBeNull();
    expect(safeJoin(base, '../secret.txt')).toBeNull();
  });

  test('an absolute path outside the base directory is rejected', () => {
    expect(safeJoin(base, '/etc/passwd')).toBeNull();
  });

  test('a null byte is rejected outright', () => {
    expect(safeJoin(base, 'photo.jpg\0.png')).toBeNull();
  });

  test('nested traversal that still lands back inside the base directory is allowed', () => {
    const result = safeJoin(base, 'sub/../photo.jpg');
    expect(result).toBe(path.join(base, 'photo.jpg'));
  });
});

describe('SAFE_FILENAME_PATTERN', () => {
  test('accepts real generated filenames', () => {
    expect(SAFE_FILENAME_PATTERN.test('550e8400-e29b-41d4-a716-446655440000.jpg')).toBe(true);
    expect(SAFE_FILENAME_PATTERN.test('550e8400-e29b-41d4-a716-446655440000.png')).toBe(true);
  });

  test('rejects anything containing a path separator or traversal sequence', () => {
    expect(SAFE_FILENAME_PATTERN.test('../../.env')).toBe(false);
    expect(SAFE_FILENAME_PATTERN.test('..%2f..%2f.env')).toBe(false);
    expect(SAFE_FILENAME_PATTERN.test('550e8400-e29b-41d4-a716-446655440000.jpg/../.env')).toBe(false);
    expect(SAFE_FILENAME_PATTERN.test('/etc/passwd')).toBe(false);
    expect(SAFE_FILENAME_PATTERN.test('.env')).toBe(false);
  });

  test('rejects a disguised executable/script extension', () => {
    expect(SAFE_FILENAME_PATTERN.test('550e8400-e29b-41d4-a716-446655440000.php')).toBe(false);
    expect(SAFE_FILENAME_PATTERN.test('550e8400-e29b-41d4-a716-446655440000.html')).toBe(false);
  });
});

describe('serveEquipmentImage (HTTP-level)', () => {
  const realFilename = `test-fixture-${Date.now()}.jpg`;
  const realFilePath = path.join(UPLOAD_DIR, realFilename);

  beforeAll(() => {
    fs.writeFileSync(realFilePath, Buffer.from([0xff, 0xd8, 0xff])); // not a valid UUID name on purpose, see below
  });

  afterAll(() => {
    fs.rmSync(realFilePath, { force: true });
  });

  test('a real, correctly-formatted UUID filename is served successfully', () => {
    // Rename to a pattern-matching name only for this one assertion, so the traversal tests
    // below aren't relying on a file that happens to already exist.
    const uuidName = '550e8400-e29b-41d4-a716-446655440099.jpg';
    const uuidPath = path.join(UPLOAD_DIR, uuidName);
    fs.copyFileSync(realFilePath, uuidPath);

    const req = { params: { filename: uuidName } };
    const res = mockRes();
    serveEquipmentImage(req, res);

    expect(res._sentFile).toBe(uuidName);
    expect(res.headersSent).toBe(true);

    fs.rmSync(uuidPath, { force: true });
  });

  test('this is the concrete scenario: a crafted filename cannot escape to read backend/.env', () => {
    const envPath = path.resolve(UPLOAD_DIR, '../../.env');
    expect(fs.existsSync(envPath)).toBe(true); // sanity check the target actually exists

    const attempts = [
      '../../.env',
      '..%2f..%2f.env',
      '....//....//.env',
      '/etc/passwd',
      '..\\..\\.env',
    ];

    for (const attempt of attempts) {
      const req = { params: { filename: attempt } };
      const res = mockRes();
      serveEquipmentImage(req, res);
      expect(res._status).toBe(404);
      expect(res._sentFile).toBeUndefined();
    }
  });

  test('a well-formed but nonexistent UUID filename 404s cleanly, not a 500', () => {
    const req = { params: { filename: '00000000-0000-0000-0000-000000000000.jpg' } };
    const res = mockRes();
    serveEquipmentImage(req, res);
    expect(res._status).toBe(404);
  });
});
