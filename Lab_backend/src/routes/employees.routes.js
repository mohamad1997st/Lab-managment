const express = require('express');
const router = express.Router();
const controller = require('../controllers/employees.controller');
const { requireAuth, requireRole, requireActiveSubscription, requireLabQuota } = require('../middleware/auth.middleware');
const { ROLE_OWNER, ROLE_MANAGER } = require('../config/roles');

router.use(requireAuth);

router.get('/', controller.getAll);
router.post(
  '/',
  requireRole(ROLE_OWNER, ROLE_MANAGER),
  requireActiveSubscription(),
  requireLabQuota(
    'max_employees',
    'SELECT COUNT(*)::int AS count FROM employees WHERE lab_id = $1 AND is_active = true',
    'Your current subscription employee limit has been reached.'
  ),
  controller.create
);
router.patch('/:id', requireRole(ROLE_OWNER, ROLE_MANAGER), controller.update);

module.exports = router;
