const express = require('express');
const router = express.Router();
const inventoryCtrl = require('../controllers/inventory.controller');
const { requireAuth, requireRole, requireActiveSubscription } = require('../middleware/auth.middleware');
const { ROLE_OWNER, ROLE_MANAGER } = require('../config/roles');

router.use(requireAuth);

router.get('/', requireRole(ROLE_OWNER, ROLE_MANAGER), inventoryCtrl.getAllInventory);
router.post('/', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), inventoryCtrl.createInventory);
router.put('/:id', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), inventoryCtrl.updateInventoryMotherJars);

module.exports = router;
