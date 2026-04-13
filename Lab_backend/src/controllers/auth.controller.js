const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRES, COOKIE_OPTIONS } = require('../config/auth.config');
const { ROLE_OWNER, normalizeRole } = require('../config/roles');
const { APP_ORIGIN } = require('../config/email.config');
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  googleConfigured,
  OAUTH_STATE_SECRET
} = require('../config/oauth.config');
const { sendPasswordResetEmail } = require('../services/email.service');
const { getEffectiveSubscription, getLabUsageById } = require('../services/subscription.service');

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

const signToken = (user) => jwt.sign(
  { id: user.id, role: normalizeRole(user.role), lab_id: user.lab_id, employee_id: user.employee_id || null },
  JWT_ACCESS_SECRET,
  { expiresIn: JWT_ACCESS_EXPIRES }
);

const signOAuthState = (payload) => jwt.sign(payload, OAUTH_STATE_SECRET, { expiresIn: '10m' });
const parseOAuthState = (state) => jwt.verify(state, OAUTH_STATE_SECRET);
const normalizeRedirectPath = (value) => {
  const normalized = String(value || '/').trim();
  if (!normalized.startsWith('/')) return '/';
  if (normalized.startsWith('//') || normalized.startsWith('/api/')) return '/';
  return normalized;
};

async function loadAuthPayloadByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.lab_id,
       u.employee_id,
       u.username,
       u.full_name,
       u.email,
       u.role,
       u.auth_provider,
       l.name AS lab_name,
       l.email AS lab_email,
       l.phone AS lab_phone,
       l.address AS lab_address,
       l.subscription_plan,
       l.subscription_status,
       l.subscription_starts_at,
       l.subscription_ends_at,
       l.trial_ends_at,
       l.stripe_subscription_id,
       l.max_users,
       l.max_employees,
       l.max_species
     FROM users u
     LEFT JOIN labs l ON l.id = u.lab_id
     WHERE u.id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const record = rows[0];
  const usage = await getLabUsageById(record.lab_id);

  return {
    user: {
      id: record.id,
      lab_id: record.lab_id,
      employee_id: record.employee_id,
      username: record.username,
      full_name: record.full_name,
      email: record.email,
      role: normalizeRole(record.role),
      auth_provider: record.auth_provider || 'password',
      subscription: {
        ...getEffectiveSubscription(record),
        usage
      }
    },
    lab: record.lab_id
      ? {
          id: record.lab_id,
          name: record.lab_name,
          email: record.lab_email,
          phone: record.lab_phone,
          address: record.lab_address,
          subscription: {
            ...getEffectiveSubscription(record),
            usage
          }
        }
      : null
  };
}

async function exchangeGoogleCodeForProfile(code) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    throw new Error('Google token exchange failed');
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!profileRes.ok) {
    throw new Error('Google profile fetch failed');
  }

  return profileRes.json();
}

const PASSWORD_RESET_RESPONSE = {
  ok: true,
  message: 'If that email exists, a reset link has been prepared.'
};

exports.status = async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS user_count,
      COUNT(DISTINCT lab_id)::int AS lab_count
    FROM users
  `);

  res.json({
    canRegister: true,
    userCount: rows[0].user_count,
    labCount: rows[0].lab_count,
    googleAuthEnabled: googleConfigured
  });
};

exports.session = async (req, res) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.json({ authenticated: false, user: null, lab: null });
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const authPayload = await loadAuthPayloadByUserId(payload.id);

    if (!authPayload) {
      return res.json({ authenticated: false, user: null, lab: null });
    }

    return res.json({
      authenticated: true,
      user: authPayload.user,
      lab: authPayload.lab
    });
  } catch {
    return res.json({ authenticated: false, user: null, lab: null });
  }
};

exports.setupAdmin = async (req, res) => {
  const lab_name = normalizeText(req.body?.lab_name);
  const full_name = normalizeText(req.body?.full_name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  const username = buildUsername(req.body || {});

  if (!lab_name || !full_name || !email || !password) {
    return res.status(400).json({ error: 'lab_name, full_name, email, and password are required' });
  }

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
    [email, username]
  );
  if (existingUser.rowCount > 0) {
    return res.status(409).json({ error: 'Email or username already exists' });
  }

  const existingLab = await pool.query(
    'SELECT id FROM labs WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [lab_name]
  );
  if (existingLab.rowCount > 0) {
    return res.status(409).json({ error: 'Lab name already exists' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const labInsert = await client.query(
      `INSERT INTO labs (
         name,
         subscription_plan,
         subscription_status,
         trial_ends_at,
         max_users,
         max_employees,
         max_species
       )
       VALUES ($1, 'trial', 'trialing', NOW() + interval '14 days', 3, 10, 20)
       RETURNING
         id,
         name,
         email,
         phone,
         address,
         subscription_plan,
         subscription_status,
         subscription_starts_at,
         subscription_ends_at,
         trial_ends_at,
         max_users,
         max_employees,
         max_species`,
      [lab_name]
    );

    const lab = labInsert.rows[0];
    const hash = await bcrypt.hash(password, 10);

    const userInsert = await client.query(
      `INSERT INTO users (lab_id, username, full_name, email, password_hash, role, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, 'password')
       RETURNING id, lab_id, employee_id, username, role, full_name, email, auth_provider`,
      [lab.id, username, full_name, email, hash, ROLE_OWNER]
    );

    await client.query('COMMIT');

    const user = userInsert.rows[0];
    const token = signToken(user);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.status(201).json({ user, lab });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.login = async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');

  const found = await pool.query(
    `SELECT id, lab_id, employee_id, username, full_name, email, password_hash, role, auth_provider
     FROM users
     WHERE email = $1`,
    [email]
  );
  if (found.rowCount === 0) return res.status(401).json({ error: 'Invalid credentials' });

  const user = found.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json(await loadAuthPayloadByUserId(user.id));
};

exports.requestPasswordReset = async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const found = await pool.query(
    `SELECT id, full_name, email
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  if (found.rowCount === 0) {
    return res.json(PASSWORD_RESET_RESPONSE);
  }

  const user = found.rows[0];
  const token = crypto.randomBytes(24).toString('hex');

  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [user.id]
  );

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + interval '1 hour')`,
    [user.id, token]
  );

  const resetUrl = `${APP_ORIGIN}/reset-password/${token}`;

  try {
    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetUrl
    });

    return res.json({
      ...PASSWORD_RESET_RESPONSE,
      reset_url: resetUrl,
      email: emailResult
    });
  } catch (error) {
    return res.json({
      ...PASSWORD_RESET_RESPONSE,
      reset_url: resetUrl,
      email: {
        delivered: false,
        skipped: false,
        error: error.message
      }
    });
  }
};

exports.getPasswordResetToken = async (req, res) => {
  const token = normalizeText(req.params.token);

  const { rows } = await pool.query(
    `SELECT prt.id, prt.expires_at, prt.used_at, u.email
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = $1
     LIMIT 1`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Reset link not found' });
  }

  const resetToken = rows[0];
  if (resetToken.used_at) {
    return res.status(400).json({ error: 'This reset link has already been used' });
  }
  if (new Date(resetToken.expires_at) <= new Date()) {
    return res.status(400).json({ error: 'This reset link has expired' });
  }

  res.json({
    reset: {
      email: resetToken.email,
      expires_at: resetToken.expires_at
    }
  });
};

exports.resetPassword = async (req, res) => {
  const token = normalizeText(req.params.token);
  const password = String(req.body?.password || '');

  if (!password.trim()) {
    return res.status(400).json({ error: 'password is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tokenRes = await client.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token = $1
       FOR UPDATE`,
      [token]
    );

    if (tokenRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reset link not found' });
    }

    const resetToken = tokenRes.rows[0];
    if (resetToken.used_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link has already been used' });
    }
    if (new Date(resetToken.expires_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link has expired' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [password_hash, resetToken.user_id]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [resetToken.id]
    );

    await client.query('COMMIT');

    res.json({ ok: true, message: 'Password reset successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.logout = async (_req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.json({ ok: true });
};

exports.googleStart = async (req, res) => {
  if (!googleConfigured) {
    return res.status(503).json({ error: 'Google sign-in is not configured yet' });
  }

  const mode = req.query.mode === 'register' ? 'register' : 'login';
  const redirectPath = normalizeRedirectPath(req.query.redirect || '/');
  const state = signOAuthState({ mode, redirectPath });

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  googleUrl.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URL);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('prompt', 'select_account');
  googleUrl.searchParams.set('state', state);

  return res.redirect(302, googleUrl.toString());
};

exports.googleCallback = async (req, res) => {
  const fail = (message) => res.redirect(`${APP_ORIGIN}/login?oauth_error=${encodeURIComponent(message)}`);

  try {
    if (!googleConfigured) {
      return fail('Google sign-in is not configured yet');
    }

    const code = normalizeText(req.query?.code);
    const stateValue = normalizeText(req.query?.state);
    if (!code || !stateValue) {
      return fail('Missing Google sign-in parameters');
    }

    const state = parseOAuthState(stateValue);
    const mode = state?.mode === 'register' ? 'register' : 'login';
    const redirectPath = normalizeRedirectPath(state?.redirectPath || '/');

    const profile = await exchangeGoogleCodeForProfile(code);
    const googleSub = normalizeText(profile?.sub);
    const email = normalizeText(profile?.email).toLowerCase();
    const fullName = normalizeText(profile?.name) || email;

    if (!googleSub || !email || !profile?.email_verified) {
      return fail('Google account email is missing or not verified');
    }

    let userRes = await pool.query(
      `SELECT id, lab_id, employee_id, username, role, full_name, email, auth_provider
       FROM users
       WHERE google_sub = $1
       LIMIT 1`,
      [googleSub]
    );

    if (userRes.rowCount === 0) {
      userRes = await pool.query(
        `SELECT id, lab_id, employee_id, username, role, full_name, email, auth_provider
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email]
      );

      if (userRes.rowCount > 0) {
        await pool.query(
          `UPDATE users
           SET google_sub = $1
           WHERE id = $2`,
          [googleSub, userRes.rows[0].id]
        );
      }
    }

    if (userRes.rowCount === 0) {
      if (mode !== 'register') {
        return fail('No account found for this Google email. Use Create Lab first.');
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const baseLabName = `${fullName}'s Lab`;
        const existingLab = await client.query(
          'SELECT id FROM labs WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [baseLabName]
        );
        const labName = existingLab.rowCount === 0 ? baseLabName : `${baseLabName} ${Date.now()}`;

        const labInsert = await client.query(
          `INSERT INTO labs (
             name,
             subscription_plan,
             subscription_status,
             trial_ends_at,
             max_users,
             max_employees,
             max_species
           )
           VALUES ($1, 'trial', 'trialing', NOW() + interval '14 days', 3, 10, 20)
           RETURNING id`,
          [labName]
        );

        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const username = buildUsername({ email, full_name: fullName });

        userRes = await client.query(
          `INSERT INTO users (lab_id, username, full_name, email, password_hash, role, auth_provider, google_sub)
           VALUES ($1, $2, $3, $4, $5, $6, 'google', $7)
           RETURNING id, lab_id, employee_id, username, role, full_name, email, auth_provider`,
          [labInsert.rows[0].id, username, fullName, email, passwordHash, ROLE_OWNER, googleSub]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const user = userRes.rows[0];
    const token = signToken(user);
    res.cookie('token', token, COOKIE_OPTIONS);
    return res.redirect(`${APP_ORIGIN}${redirectPath}`);
  } catch (error) {
    return fail(error.message || 'Google sign-in failed');
  }
};

exports.me = async (req, res) => {
  const payload = await loadAuthPayloadByUserId(req.user.id);
  if (!payload) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(payload);
};

exports.updateMe = async (req, res) => {
  const username = normalizeText(req.body?.username);
  const full_name = normalizeText(req.body?.full_name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !full_name || !email) {
    return res.status(400).json({ error: 'username, full_name, and email are required' });
  }

  const duplicate = await pool.query(
    `SELECT id
     FROM users
     WHERE id <> $1
       AND (LOWER(email) = LOWER($2) OR LOWER(username) = LOWER($3))
     LIMIT 1`,
    [req.user.id, email, username]
  );

  if (duplicate.rowCount > 0) {
    return res.status(409).json({ error: 'Email or username already exists' });
  }

  if (password.trim()) {
    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET username = $1,
           full_name = $2,
           email = $3,
           password_hash = $4
       WHERE id = $5`,
      [username, full_name, email, password_hash, req.user.id]
    );
  } else {
    await pool.query(
      `UPDATE users
       SET username = $1,
           full_name = $2,
           email = $3
       WHERE id = $4`,
      [username, full_name, email, req.user.id]
    );
  }

  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.lab_id,
       u.employee_id,
       u.username,
       u.full_name,
       u.email,
       u.role,
       l.name AS lab_name,
       l.subscription_plan,
       l.subscription_status,
       l.subscription_starts_at,
       l.subscription_ends_at,
       l.trial_ends_at,
       l.stripe_subscription_id,
       l.max_users,
       l.max_employees,
       l.max_species
     FROM users u
     LEFT JOIN labs l ON l.id = u.lab_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  const usage = await getLabUsageById(rows[0].lab_id);

  res.json({
    user: {
      ...rows[0],
      role: normalizeRole(rows[0].role),
      subscription: {
        ...getEffectiveSubscription(rows[0]),
        usage
      }
    }
  });
};
