const ROLE_OWNER = 'owner';
const ROLE_MANAGER = 'manager';
const ROLE_STAFF = 'staff';

const ALLOWED_ROLES = [ROLE_OWNER, ROLE_MANAGER, ROLE_STAFF];

const LEGACY_ROLE_MAP = {
  admin: ROLE_OWNER
};

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return ROLE_STAFF;

  const mapped = LEGACY_ROLE_MAP[normalized] || normalized;
  return ALLOWED_ROLES.includes(mapped) ? mapped : ROLE_STAFF;
};

const isStaffRole = (role) => normalizeRole(role) === ROLE_STAFF;

module.exports = {
  ROLE_OWNER,
  ROLE_MANAGER,
  ROLE_STAFF,
  ALLOWED_ROLES,
  normalizeRole,
  isStaffRole
};
