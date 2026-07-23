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
