const express = require('express');
const router = express.Router();
const controller = require('../controllers/contamination.controller');
const { requireAuth, requireRole, requireActiveSubscription } = require('../middleware/auth.middleware');
const { ROLE_OWNER, ROLE_MANAGER } = require('../config/roles');

router.use(requireAuth);

router.get('/', controller.getAll);
router.post('/', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), controller.create);

module.exports = router;
