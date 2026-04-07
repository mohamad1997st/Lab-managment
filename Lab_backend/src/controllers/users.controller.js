const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { ROLE_MANAGER, ROLE_STAFF, normalizeRole } = require('../config/roles');

const normalizeText = (value) => String(value || '').trim();

const buildUsername = ({ username, email, full_name }) => {
  const normalizedUsername = normalizeText(username);
  if (normalizedUsername) return normalizedUsername;

  const emailPrefix = normalizeText(email).split('@')[0];
  if (emailPrefix) return emailPrefix;

  const fullNameSlug = normalizeText(full_name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return fullNameSlug || `user_${Date.now()}`;
};

exports.getAll = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, lab_id, employee_id, username, full_name, email, role
     FROM users
     WHERE lab_id = $1
     ORDER BY id ASC`,
    [req.user.lab_id]
  );

  res.json(rows.map((row) => ({ ...row, role: normalizeRole(row.role) })));
};

exports.create = async (req, res) => {
  const full_name = normalizeText(req.body?.full_name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  const requestedRole = normalizeRole(req.body?.role);
  const username = buildUsername(req.body || {});

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password are required' });
  }

  if (![ROLE_MANAGER, ROLE_STAFF].includes(requestedRole)) {
    return res.status(400).json({ error: 'Only manager or staff accounts can be created here' });
  }

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
    [email, username]
  );

  if (existingUser.rowCount > 0) {
    return res.status(409).json({ error: 'Email or username already exists' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let employeeId = null;

    if (requestedRole === ROLE_STAFF) {
      const employeeRes = await client.query(
        `SELECT id FROM employees WHERE lab_id = $1 AND LOWER(full_name) = LOWER($2) ORDER BY id ASC LIMIT 1`,
        [req.user.lab_id, full_name]
      );

      if (employeeRes.rowCount > 0) {
        employeeId = employeeRes.rows[0].id;
      } else {
        const insertedEmployee = await client.query(
          `INSERT INTO employees (lab_id, full_name)
           VALUES ($1, $2)
           RETURNING id`,
          [req.user.lab_id, full_name]
        );
        employeeId = insertedEmployee.rows[0].id;
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      `INSERT INTO users (lab_id, employee_id, username, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, lab_id, employee_id, username, full_name, email, role`,
      [req.user.lab_id, employeeId, username, full_name, email, password_hash, requestedRole]
    );

    await client.query('COMMIT');

    res.status(201).json({
      user: {
        ...rows[0],
        role: normalizeRole(rows[0].role)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.update = async (req, res) => {
  const userId = Number(req.params.id);
  const requestedRole = normalizeRole(req.body?.role);
  const username = normalizeText(req.body?.username);
  const full_name = normalizeText(req.body?.full_name);
  const email = normalizeText(req.body?.email).toLowerCase();

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (![ROLE_MANAGER, ROLE_STAFF].includes(requestedRole)) {
    return res.status(400).json({ error: 'Only manager or staff roles can be assigned here' });
  }

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own owner account here' });
  }

  if (!username || !full_name || !email) {
    return res.status(400).json({ error: 'username, full_name, and email are required' });
  }

  const duplicate = await pool.query(
    `SELECT id
     FROM users
     WHERE lab_id = $1
       AND id <> $2
       AND (LOWER(email) = LOWER($3) OR LOWER(username) = LOWER($4))
     LIMIT 1`,
    [req.user.lab_id, userId, email, username]
  );

  if (duplicate.rowCount > 0) {
    return res.status(409).json({ error: 'Email or username already exists' });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET username = $1,
         full_name = $2,
         email = $3,
         role = $4
     WHERE id = $5 AND lab_id = $6
     RETURNING id, lab_id, employee_id, username, full_name, email, role`,
    [username, full_name, email, requestedRole, userId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    user: {
      ...rows[0],
      role: normalizeRole(rows[0].role)
    }
  });
};

exports.resetPassword = async (req, res) => {
  const userId = Number(req.params.id);
  const password = String(req.body?.password || '');

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (!password.trim()) {
    return res.status(400).json({ error: 'password is required' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2 AND lab_id = $3
     RETURNING id, username, full_name, email`,
    [password_hash, userId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ message: 'Password reset successfully', user: rows[0] });
};

exports.remove = async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own owner account' });
  }

  const { rows } = await pool.query(
    `DELETE FROM users
     WHERE id = $1 AND lab_id = $2
     RETURNING id, username, full_name, email`,
    [userId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ message: 'User removed successfully', user: rows[0] });
};
