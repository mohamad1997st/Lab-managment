const pool = require('../config/db');

exports.getAll = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM species WHERE lab_id = $1 ORDER BY species_name',
    [req.user.lab_id]
  );
  res.json(rows);
};

exports.create = async (req, res) => {
  const species_name = String(req.body?.species_name || '').trim();
  if (!species_name) {
    return res.status(400).json({ error: 'species_name is required' });
  }

  const { rows } = await pool.query(
    'INSERT INTO species (lab_id, species_name) VALUES ($1, $2) RETURNING *',
    [req.user.lab_id, species_name]
  );
  res.status(201).json(rows[0]);
};
