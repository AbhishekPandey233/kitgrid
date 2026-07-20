const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { imageUpload } = require('../middleware/upload');
const {
  uploadEquipmentImage,
  listEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} = require('../controllers/equipment.controller');

const router = express.Router();

// multer is invoked manually (not as a plain middleware in the chain) so a rejected file
// (wrong type, too large) comes back as a clean 400 JSON response instead of falling through
// to the generic 500 error handler, which doesn't know multer's error shape.
function runImageUpload(req, res, next) {
  imageUpload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

router.get('/', listEquipment);
router.get('/:id', getEquipmentById);
router.post('/upload-image', requireAuth, requireRole('admin'), runImageUpload, uploadEquipmentImage);
router.post('/', requireAuth, requireRole('admin'), createEquipment);
router.patch('/:id', requireAuth, requireRole('admin'), updateEquipment);
router.delete('/:id', requireAuth, requireRole('admin'), deleteEquipment);

module.exports = router;
