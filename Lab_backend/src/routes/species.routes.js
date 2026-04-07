const express = require('express');
const router = express.Router();
const controller = require('../controllers/species.controller');
const { requireAuth, requireRole, requireActiveSubscription, requireLabQuota } = require('../middleware/auth.middleware');
const { ROLE_OWNER, ROLE_MANAGER } = require('../config/roles');

router.use(requireAuth);

router.get('/', controller.getAll);
router.post(
  '/',
  requireRole(ROLE_OWNER, ROLE_MANAGER),
  requireActiveSubscription(),
  requireLabQuota('max_species', 'SELECT COUNT(*)::int AS count FROM species WHERE lab_id = $1', 'Your current subscription species limit has been reached.'),
  controller.create
);

module.exports = router;
