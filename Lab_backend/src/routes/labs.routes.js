const express = require('express');
const router = express.Router();
const controller = require('../controllers/labs.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { ROLE_OWNER } = require('../config/roles');

router.use(requireAuth);

router.get('/me', controller.getCurrentLab);
router.get('/me/logo', controller.getCurrentLabLogo);
router.put('/me', requireRole(ROLE_OWNER), controller.updateCurrentLab);
router.post('/me/logo', requireRole(ROLE_OWNER), controller.uploadCurrentLabLogo);
router.put('/me/subscription', requireRole(ROLE_OWNER), controller.updateCurrentLabSubscription);
router.get('/me/billing-history', requireRole(ROLE_OWNER), controller.getBillingHistory);
router.post('/me/billing-history', requireRole(ROLE_OWNER), controller.createBillingRecord);
router.patch('/me/billing-history/:id', requireRole(ROLE_OWNER), controller.updateBillingRecordStatus);
router.get('/me/billing-history/:id/invoice', requireRole(ROLE_OWNER), controller.downloadBillingInvoice);

module.exports = router;
