const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { safeJoin } = require('../utils/safePath');

const UPLOAD_DIR = path.join(__dirname, '../../public/equipmentImages');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Filenames are always crypto.randomUUID() + an extension derived from the validated MIME
// type — never from the client-supplied original filename. Trusting the original name/
// extension is a classic upload vulnerability (path traversal via "../", or an executable
// disguised with an image content-type but a dangerous extension).
const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Matches exactly what the generator above produces — nothing else. This is the allowlist a
// requested filename is checked against before it's ever touched by the filesystem, in
// serveEquipmentImage() below.
const SAFE_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const generatedName = `${crypto.randomUUID()}${ALLOWED_MIME_TYPES[file.mimetype]}`;
    // Belt-and-suspenders: the name above can never actually escape UPLOAD_DIR since it's
    // built entirely server-side with no user input, but routing it through the same
    // containment check used for reads means a future edit that accidentally introduces
    // user input here fails safe instead of silently becoming exploitable.
    if (!safeJoin(UPLOAD_DIR, generatedName)) {
      return cb(new Error('Could not generate a safe upload path'));
    }
    cb(null, generatedName);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
}

const imageUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// GET /equipmentImages/:filename — deliberately not a blanket express.static() mount.
// :filename is attacker-controlled input reaching a filesystem trust boundary, so it's
// checked twice, independently: first against SAFE_FILENAME_PATTERN (an allowlist so strict
// that "../", encoded traversal sequences, null bytes, or absolute paths can never match it
// at all), then via safeJoin's path-containment check on whatever survives. Either failing
// returns a plain 404 — never a distinguishable error — so this can't be used to probe for
// which paths exist outside the upload directory.
function serveEquipmentImage(req, res) {
  const { filename } = req.params;

  if (typeof filename !== 'string' || !SAFE_FILENAME_PATTERN.test(filename)) {
    return res.status(404).end();
  }

  // safeJoin's result is only checked here for containment, not passed to sendFile below —
  // Express's res.sendFile(path, { root }) expects a path relative to root and does its own
  // internal resolution against it; handing it an already-absolute path instead bypasses
  // that internal check rather than reinforcing it.
  if (!safeJoin(UPLOAD_DIR, filename)) {
    return res.status(404).end();
  }

  // Helmet's default CORP (same-origin) would otherwise block the frontend's <img> tags from
  // loading this cross-origin resource, even though CORS already permits it.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(filename, { root: UPLOAD_DIR }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
}

module.exports = { imageUpload, UPLOAD_DIR, serveEquipmentImage, SAFE_FILENAME_PATTERN };
