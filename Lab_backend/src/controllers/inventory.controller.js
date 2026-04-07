const pool = require('../config/db');

exports.getAllInventory = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        i.id,
        i.species_id,
        s.species_name,
        i.subculture_mother_jars,
        i.number_mother_jar
      FROM inventory i
      JOIN species s ON s.id = i.species_id
      WHERE i.lab_id = $1
      ORDER BY s.species_name, i.subculture_mother_jars, i.id
    `, [req.user.lab_id]);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.createInventory = async (req, res) => {
  try {
    const { species_id, subculture_mother_jars, number_mother_jar } = req.body;

    if (!species_id || subculture_mother_jars === undefined || number_mother_jar === undefined) {
      return res.status(400).json({ error: 'species_id, subculture_mother_jars, number_mother_jar are required' });
    }

    const spId = Number(species_id);
    const sub = Number(subculture_mother_jars);
    const jars = Number(number_mother_jar);

    if (!Number.isFinite(spId) || !Number.isFinite(sub) || !Number.isFinite(jars)) {
      return res.status(400).json({ error: 'Invalid numbers' });
    }
    if (sub < 0 || jars < 0) {
      return res.status(400).json({ error: 'Values cannot be negative' });
    }

    // ✅ Optional: منع تكرار نفس species + subculture
    const speciesRes = await pool.query(
      `SELECT id FROM species WHERE id = $1 AND lab_id = $2 LIMIT 1`,
      [spId, req.user.lab_id]
    );
    if (speciesRes.rowCount === 0) {
      return res.status(404).json({ error: 'Species not found for this lab' });
    }

    const exists = await pool.query(
      `SELECT id FROM inventory WHERE lab_id=$1 AND species_id=$2 AND subculture_mother_jars=$3 LIMIT 1`,
      [req.user.lab_id, spId, sub]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Inventory already exists for this species + subculture' });
    }

    const ins = await pool.query(
      `
      INSERT INTO inventory (lab_id, species_id, subculture_mother_jars, number_mother_jar)
      VALUES ($1,$2,$3,$4)
      RETURNING id
      `,
      [req.user.lab_id, spId, sub, jars]
    );

    return res.status(201).json({ id: ins.rows[0].id, message: 'Inventory created' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};

exports.updateInventoryMotherJars = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const jars = Number(req.body?.number_mother_jar);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid inventory id' });
    }
    if (!Number.isFinite(jars) || jars < 0) {
      return res.status(400).json({ error: 'number_mother_jar must be a non-negative number' });
    }

    const upd = await pool.query(
      `
      UPDATE inventory
      SET number_mother_jar = $2
      WHERE id = $1 AND lab_id = $3
      RETURNING id, species_id, subculture_mother_jars, number_mother_jar
      `,
      [id, jars, req.user.lab_id]
    );

    if (upd.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    return res.json(upd.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
