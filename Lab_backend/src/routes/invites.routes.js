const express = require('express');
const router = express.Router();
const controller = require('../controllers/invites.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { ROLE_OWNER } = require('../config/roles');

router.get('/public/:token', controller.getPublicInvite);
router.post('/public/:token/accept', controller.accept);

router.use(requireAuth, requireRole(ROLE_OWNER));

router.get('/', controller.getAll);
router.post('/', controller.create);
router.post('/test-email', controller.sendTest);
router.post('/:id/resend', controller.resend);
router.delete('/:id', controller.revoke);

module.exports = router;
