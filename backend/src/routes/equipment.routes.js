const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  listEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} = require('../controllers/equipment.controller');

const router = express.Router();

router.get('/', listEquipment);
router.get('/:id', getEquipmentById);
router.post('/', requireAuth, requireRole('admin'), createEquipment);
router.patch('/:id', requireAuth, requireRole('admin'), updateEquipment);
router.delete('/:id', requireAuth, requireRole('admin'), deleteEquipment);

module.exports = router;
