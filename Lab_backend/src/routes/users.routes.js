const express = require('express');
const router = express.Router();
const controller = require('../controllers/users.controller');
const { requireAuth, requireRole, requireActiveSubscription, requireLabQuota } = require('../middleware/auth.middleware');
const { ROLE_OWNER } = require('../config/roles');

router.use(requireAuth, requireRole(ROLE_OWNER));

router.get('/', controller.getAll);
router.post(
  '/',
  requireActiveSubscription(),
  requireLabQuota('max_users', 'SELECT COUNT(*)::int AS count FROM users WHERE lab_id = $1', 'Your current subscription user limit has been reached.'),
  controller.create
);
router.put('/:id', controller.update);
router.put('/:id/password', controller.resetPassword);
router.delete('/:id', controller.remove);

module.exports = router;
