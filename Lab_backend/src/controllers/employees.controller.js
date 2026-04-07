const pool = require('../config/db');

exports.getAll = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, full_name FROM employees WHERE lab_id = $1 ORDER BY full_name',
    [req.user.lab_id]
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
