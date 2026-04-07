const pool = require('../config/db');

const normalizeText = (value) => String(value || '').trim();

exports.getAll = async (req, res) => {
  try {
    const search = normalizeText(req.query?.search).toLowerCase();

    const params = [req.user.lab_id];
    let query = `
      SELECT id, lab_id, email, source, status, subscribed_at, updated_at
      FROM newsletter_subscriptions
      WHERE lab_id = $1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND LOWER(email) LIKE $${params.length}`;
    }

    query += ' ORDER BY subscribed_at DESC';

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      error: 'Could not load newsletter subscriptions',
      details: error.message
    });
  }
};

exports.subscribe = async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const labIdRaw = req.body?.lab_id;
  const source = normalizeText(req.body?.source) || 'footer';

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  const parsedLabId = Number.parseInt(labIdRaw, 10);
  const labId = Number.isInteger(parsedLabId) && parsedLabId > 0 ? parsedLabId : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletter_subscriptions (lab_id, email, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (lab_id, email)
       DO UPDATE SET
         source = EXCLUDED.source,
         subscribed_at = NOW(),
         updated_at = NOW(),
         status = 'active'
       RETURNING id, lab_id, email, source, status, subscribed_at`,
      [labId, email, source]
    );

    return res.status(201).json({
      ok: true,
      subscription: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Could not save newsletter subscription',
      details: error.message
    });
  }
};
