const pool = require('../config/db');

const PLAN_LABELS = {
  trial: 'Trial',
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
  custom: 'Custom'
};

const STATUS_LABELS = {
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past Due',
  canceled: 'Canceled',
  expired: 'Expired'
};

const ACTIVE_STATUSES = new Set(['trialing', 'active']);

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const normalizePlan = (value) => {
  const plan = normalizeText(value);
  return PLAN_LABELS[plan] ? plan : 'trial';
};

const normalizeStatus = (value) => {
  const status = normalizeText(value);
  return STATUS_LABELS[status] ? status : 'trialing';
};

const normalizeInteger = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isPast = (value) => value && new Date(value) <= new Date();

const getEffectiveSubscription = (lab) => {
  const subscription = {
    plan: normalizePlan(lab?.subscription_plan),
    status: normalizeStatus(lab?.subscription_status),
    starts_at: lab?.subscription_starts_at || null,
    ends_at: lab?.subscription_ends_at || null,
    trial_ends_at: lab?.trial_ends_at || null,
    max_users: normalizeInteger(lab?.max_users),
    max_employees: normalizeInteger(lab?.max_employees),
    max_species: normalizeInteger(lab?.max_species)
  };

  let effectiveStatus = subscription.status;

  if (effectiveStatus === 'trialing' && isPast(subscription.trial_ends_at)) {
    effectiveStatus = 'expired';
  }
  if (effectiveStatus === 'active' && isPast(subscription.ends_at)) {
    effectiveStatus = 'expired';
  }

  return {
    ...subscription,
    status: effectiveStatus,
    is_active: ACTIVE_STATUSES.has(effectiveStatus),
    plan_label: PLAN_LABELS[subscription.plan],
    status_label: STATUS_LABELS[effectiveStatus],
    billing_provider: lab?.stripe_subscription_id ? 'stripe' : 'manual',
    is_stripe_managed: Boolean(lab?.stripe_subscription_id)
  };
};

const getLabSubscriptionById = async (labId) => {
  const { rows } = await pool.query(
    `SELECT
       id,
       subscription_plan,
       subscription_status,
       subscription_starts_at,
       subscription_ends_at,
       trial_ends_at,
       stripe_subscription_id,
       max_users,
       max_employees,
       max_species
     FROM labs
     WHERE id = $1`,
    [labId]
  );

  if (rows.length === 0) return null;

  return getEffectiveSubscription(rows[0]);
};

const getLabUsageById = async (labId) => {
  const [{ rows: userRows }, { rows: employeeRows }, { rows: speciesRows }] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM users WHERE lab_id = $1', [labId]),
    pool.query('SELECT COUNT(*)::int AS count FROM employees WHERE lab_id = $1 AND is_active = true', [labId]),
    pool.query('SELECT COUNT(*)::int AS count FROM species WHERE lab_id = $1', [labId])
  ]);

  return {
    users: userRows[0]?.count || 0,
    employees: employeeRows[0]?.count || 0,
    species: speciesRows[0]?.count || 0
  };
};

module.exports = {
  ACTIVE_STATUSES,
  getEffectiveSubscription,
  getLabUsageById,
  getLabSubscriptionById,
  normalizeDateTime,
  normalizeInteger,
  normalizePlan,
  normalizeStatus
};
