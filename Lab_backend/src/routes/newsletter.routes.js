const express = require('express');
const router = express.Router();
const controller = require('../controllers/newsletter.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { ROLE_OWNER } = require('../config/roles');

router.post('/subscribe', controller.subscribe);
router.get('/', requireAuth, requireRole(ROLE_OWNER), controller.getAll);

module.exports = router;
