const jwt = require('jsonwebtoken');
const { JWT_ACCESS_SECRET } = require('../config/auth.config');
const { normalizeRole } = require('../config/roles');
const pool = require('../config/db');
const { getLabSubscriptionById } = require('../services/subscription.service');

exports.requireAuth = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    req.user = {
      ...payload,
      role: normalizeRole(payload.role),
      employee_id: payload.employee_id || null
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

exports.requireRole = (...allowedRoles) => {
  const normalizedRoles = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!normalizedRoles.includes(normalizeRole(req.user.role))) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    next();
  };
};

exports.requireActiveSubscription = () => {
  return async (req, res, next) => {
    if (!req.user?.lab_id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const subscription = await getLabSubscriptionById(req.user.lab_id);
    if (!subscription) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    if (!subscription.is_active) {
      return res.status(402).json({
        error: `Subscription is ${subscription.status_label.toLowerCase()}.`,
        subscription
      });
    }

    req.subscription = subscription;
    next();
  };
};

exports.requireLabQuota = (quotaKey, queryText, errorMessage) => {
  return async (req, res, next) => {
    if (!req.user?.lab_id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const subscription = req.subscription || await getLabSubscriptionById(req.user.lab_id);
    if (!subscription) {
      return res.status(404).json({ error: 'Lab not found' });
    }

    if (!subscription.is_active) {
      return res.status(402).json({
        error: `Subscription is ${subscription.status_label.toLowerCase()}.`,
        subscription
      });
    }

    const limit = subscription[quotaKey];
    if (limit === null) {
      req.subscription = subscription;
      return next();
    }

    const { rows } = await pool.query(queryText, [req.user.lab_id]);
    const count = Number(rows[0]?.count || 0);
    if (count >= limit) {
      return res.status(403).json({
        error: errorMessage,
        subscription
      });
    }

    req.subscription = subscription;
    next();
  };
};
