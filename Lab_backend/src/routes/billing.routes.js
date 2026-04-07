const express = require('express');
const router = express.Router();
const controller = require('../controllers/billing.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { ROLE_OWNER } = require('../config/roles');

router.get('/config', requireAuth, requireRole(ROLE_OWNER), controller.getBillingConfig);
router.post('/checkout-session', requireAuth, requireRole(ROLE_OWNER), controller.createCheckoutSession);
router.post('/portal-session', requireAuth, requireRole(ROLE_OWNER), controller.createPortalSession);

module.exports = router;
