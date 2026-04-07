const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { ROLE_MANAGER, ROLE_STAFF, normalizeRole } = require('../config/roles');
const { APP_ORIGIN } = require('../config/email.config');
const { EMAIL_PROVIDER } = require('../config/email.config');
const { sendInviteEmail, sendTestEmail } = require('../services/email.service');

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

const createEmployeeForStaffIfNeeded = async (client, labId, role, fullName) => {
  if (role !== ROLE_STAFF) return null;

  const employeeRes = await client.query(
    `SELECT id FROM employees WHERE lab_id = $1 AND LOWER(full_name) = LOWER($2) ORDER BY id ASC LIMIT 1`,
    [labId, fullName]
  );

  if (employeeRes.rowCount > 0) {
    return employeeRes.rows[0].id;
  }

  const insertedEmployee = await client.query(
    `INSERT INTO employees (lab_id, full_name)
     VALUES ($1, $2)
     RETURNING id`,
    [labId, fullName]
  );

  return insertedEmployee.rows[0].id;
};

const sendInviteEmailForInvite = async ({ invite, inviterName, labName }) => {
  const inviteUrl = `${APP_ORIGIN}/invite/${invite.token}`;

  try {
    const result = await sendInviteEmail({
      to: invite.email,
      fullName: invite.full_name,
      labName,
      role: normalizeRole(invite.role),
      inviteUrl,
      invitedByName: inviterName
    });

    return {
      inviteUrl,
      emailResult: result
    };
  } catch (error) {
    return {
      inviteUrl,
      emailResult: {
        delivered: false,
        skipped: false,
        error: error.message
      }
    };
  }
};

exports.getAll = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ui.id, ui.lab_id, ui.invited_by_user_id, ui.full_name, ui.email, ui.role, ui.token, ui.status,
            ui.expires_at, ui.accepted_at, ui.created_at, ui.accepted_user_id,
            au.username AS accepted_username,
            au.full_name AS accepted_full_name,
            au.email AS accepted_email
     FROM user_invites ui
     LEFT JOIN users au ON au.id = ui.accepted_user_id
     WHERE ui.lab_id = $1
     ORDER BY ui.created_at DESC, ui.id DESC`,
    [req.user.lab_id]
  );

  res.json(rows.map((row) => ({
    ...row,
    role: normalizeRole(row.role)
  })));
};

exports.create = async (req, res) => {
  const full_name = normalizeText(req.body?.full_name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const requestedRole = normalizeRole(req.body?.role);
  const expiresInDays = Math.min(30, Math.max(1, Number(req.body?.expires_in_days || 7)));

  if (!full_name || !email) {
    return res.status(400).json({ error: 'full_name and email are required' });
  }

  if (![ROLE_MANAGER, ROLE_STAFF].includes(requestedRole)) {
    return res.status(400).json({ error: 'Only manager or staff invites can be created here' });
  }

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  );
  if (existingUser.rowCount > 0) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const existingInvite = await pool.query(
    `SELECT id
     FROM user_invites
     WHERE lab_id = $1
       AND LOWER(email) = LOWER($2)
       AND status = 'pending'
       AND expires_at > NOW()
     LIMIT 1`,
    [req.user.lab_id, email]
  );
  if (existingInvite.rowCount > 0) {
    return res.status(409).json({ error: 'A pending invite already exists for this email' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO user_invites
      (lab_id, invited_by_user_id, full_name, email, role, token, status, expires_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, 'pending', NOW() + ($7 || ' days')::interval)
     RETURNING id, lab_id, invited_by_user_id, full_name, email, role, token, status, expires_at, accepted_at, created_at`,
    [req.user.lab_id, req.user.id, full_name, email, requestedRole, token, String(expiresInDays)]
  );

  const invite = rows[0];
  const inviterName = normalizeText(req.user.full_name || req.user.username || 'Lab owner');
  const labRes = await pool.query('SELECT name FROM labs WHERE id = $1', [req.user.lab_id]);
  const labName = labRes.rows[0]?.name || 'your lab';
  const { inviteUrl, emailResult } = await sendInviteEmailForInvite({
    invite,
    inviterName,
    labName
  });

  res.status(201).json({
    invite: {
      ...invite,
      role: normalizeRole(invite.role),
      invite_url: inviteUrl
    },
    email: emailResult
  });
};

exports.resend = async (req, res) => {
  const inviteId = Number(req.params.id);

  if (!Number.isFinite(inviteId) || inviteId <= 0) {
    return res.status(400).json({ error: 'Invalid invite id' });
  }

  const { rows } = await pool.query(
    `SELECT id, lab_id, invited_by_user_id, full_name, email, role, token, status, expires_at, accepted_at, created_at
     FROM user_invites
     WHERE id = $1 AND lab_id = $2`,
    [inviteId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  const invite = rows[0];
  if (invite.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending invites can be resent' });
  }
  if (new Date(invite.expires_at) <= new Date()) {
    return res.status(400).json({ error: 'This invite has expired' });
  }

  const inviterName = normalizeText(req.user.full_name || req.user.username || 'Lab owner');
  const labRes = await pool.query('SELECT name FROM labs WHERE id = $1', [req.user.lab_id]);
  const labName = labRes.rows[0]?.name || 'your lab';
  const { inviteUrl, emailResult } = await sendInviteEmailForInvite({
    invite,
    inviterName,
    labName
  });

  res.json({
    invite: {
      ...invite,
      role: normalizeRole(invite.role),
      invite_url: inviteUrl
    },
    email: emailResult
  });
};

exports.sendTest = async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    const emailResult = await sendTestEmail({ to: email });
    return res.json({ ok: Boolean(emailResult?.delivered), email: emailResult });
  } catch (error) {
    return res.json({
      ok: false,
      email: {
        delivered: false,
        skipped: false,
        provider: EMAIL_PROVIDER || null,
        error: error?.message || 'Email provider request failed'
      }
    });
  }
};

exports.revoke = async (req, res) => {
  const inviteId = Number(req.params.id);
  if (!Number.isFinite(inviteId) || inviteId <= 0) {
    return res.status(400).json({ error: 'Invalid invite id' });
  }

  const { rows } = await pool.query(
    `UPDATE user_invites
     SET status = 'revoked'
     WHERE id = $1 AND lab_id = $2 AND status = 'pending'
     RETURNING id, email`,
    [inviteId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Pending invite not found' });
  }

  res.json({ message: 'Invite revoked successfully', invite: rows[0] });
};

exports.getPublicInvite = async (req, res) => {
  const token = normalizeText(req.params.token);

  const { rows } = await pool.query(
    `SELECT ui.id, ui.lab_id, ui.full_name, ui.email, ui.role, ui.status, ui.expires_at, l.name AS lab_name
     FROM user_invites ui
     JOIN labs l ON l.id = ui.lab_id
     WHERE ui.token = $1`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  const invite = rows[0];
  if (invite.status !== 'pending') {
    return res.status(400).json({ error: 'This invite is no longer active' });
  }
  if (new Date(invite.expires_at) <= new Date()) {
    return res.status(400).json({ error: 'This invite has expired' });
  }

  res.json({
    invite: {
      ...invite,
      role: normalizeRole(invite.role)
    }
  });
};

exports.accept = async (req, res) => {
  const token = normalizeText(req.params.token);
  const username = buildUsername(req.body || {});
  const full_name = normalizeText(req.body?.full_name);
  const password = String(req.body?.password || '');

  if (!full_name || !password) {
    return res.status(400).json({ error: 'full_name and password are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteRes = await client.query(
      `SELECT id, lab_id, full_name, email, role, status, expires_at
       FROM user_invites
       WHERE token = $1
       FOR UPDATE`,
      [token]
    );

    if (inviteRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = inviteRes.rows[0];
    if (invite.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This invite is no longer active' });
    }
    if (new Date(invite.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This invite has expired' });
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2) LIMIT 1',
      [invite.email, username]
    );
    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A user with this email or username already exists' });
    }

    const normalizedRole = normalizeRole(invite.role);
    const employeeId = await createEmployeeForStaffIfNeeded(client, invite.lab_id, normalizedRole, full_name);
    const password_hash = await bcrypt.hash(password, 10);

    const userInsert = await client.query(
      `INSERT INTO users (lab_id, employee_id, username, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, lab_id, employee_id, username, full_name, email, role`,
      [invite.lab_id, employeeId, username, full_name, invite.email, password_hash, normalizedRole]
    );

    await client.query(
      `UPDATE user_invites
       SET status = 'accepted',
           accepted_at = NOW(),
           accepted_user_id = $2
       WHERE id = $1`,
      [invite.id, userInsert.rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      user: {
        ...userInsert.rows[0],
        role: normalizeRole(userInsert.rows[0].role)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
