const pool = require('../config/db');

exports.getAll = async (req, res) => {
  const includeInactive =
    String(req.query.include_inactive ?? '').toLowerCase() === 'true' ||
    String(req.query.include_inactive ?? '') === '1';

  const { rows } = await pool.query(
    `
    SELECT
      id,
      CASE
        WHEN is_active THEN full_name
        ELSE ('Former employee #' || id)
      END AS full_name,
      is_active,
      left_at
    FROM employees
    WHERE lab_id = $1
      AND ($2::boolean = true OR is_active = true)
    ORDER BY is_active DESC, full_name
    `,
    [req.user.lab_id, includeInactive]
  );

  res.json(rows);
};

exports.create = async (req, res) => {
  const full_name = String(req.body?.full_name || '').trim();
  if (!full_name) {
    return res.status(400).json({ error: 'full_name is required' });
  }

  const { rows } = await pool.query(
    'INSERT INTO employees (lab_id, full_name) VALUES ($1, $2) RETURNING *',
    [req.user.lab_id, full_name]
  );
  res.status(201).json(rows[0]);
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid employee id' });
  }

  const isActive = req.body?.is_active;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be boolean' });
  }

  const { rows } = await pool.query(
    `
    UPDATE employees
    SET
      is_active = $1,
      left_at = CASE WHEN $1 THEN NULL ELSE now() END
    WHERE id = $2 AND lab_id = $3
    RETURNING
      id,
      CASE
        WHEN is_active THEN full_name
        ELSE ('Former employee #' || id)
      END AS full_name,
      is_active,
      left_at
    `,
    [isActive, id, req.user.lab_id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Employee not found for this lab' });
  }

  res.json(rows[0]);
};
