const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { safeJoin } = require('../utils/safePath');

const UPLOAD_DIR = path.join(__dirname, '../../public/equipmentImages');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const SAFE_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const generatedName = `${crypto.randomUUID()}${ALLOWED_MIME_TYPES[file.mimetype]}`;
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

function serveEquipmentImage(req, res) {
  const { filename } = req.params;

  if (typeof filename !== 'string' || !SAFE_FILENAME_PATTERN.test(filename)) {
    return res.status(404).end();
  }

  if (!safeJoin(UPLOAD_DIR, filename)) {
    return res.status(404).end();
  }

  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(filename, { root: UPLOAD_DIR }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).end();
    }
  });
}

module.exports = { imageUpload, UPLOAD_DIR, serveEquipmentImage, SAFE_FILENAME_PATTERN };
