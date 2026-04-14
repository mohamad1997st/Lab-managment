const pool = require('../config/db');

const ALLOWED_PHASES = new Set([
  'Initiation',
  'Multiplication',
  'Rooting',
  'Acclimatization',
  'Other'
]);

const ZERO_SUBCULTURE_PHASES = new Set([
  'Initiation',
  'Rooting',
  'Acclimatization',
  'Other'
]);

exports.getAllInventory = async (req, res) => {
  try {
    const phase = req.query?.phase;
    const params = [req.user.lab_id];
    let where = 'WHERE i.lab_id = $1';

    if (phase) {
      if (!ALLOWED_PHASES.has(phase)) {
        return res.status(400).json({ error: 'Invalid phase_of_culture filter' });
      }
      params.push(phase);
      where += ` AND i.phase_of_culture = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        i.id,
        i.species_id,
        s.species_name,
        i.phase_of_culture,
        i.subculture_mother_jars,
        i.number_mother_jar
      FROM inventory i
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY s.species_name, i.phase_of_culture, i.subculture_mother_jars, i.id
      `,
      params
    );

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.createInventory = async (req, res) => {
  try {
    const { species_id, subculture_mother_jars, number_mother_jar } = req.body;
    const phase = req.body?.phase_of_culture || 'Multiplication';

    if (!species_id || number_mother_jar === undefined) {
      return res.status(400).json({ error: 'species_id and number_mother_jar are required' });
    }
    if (!ALLOWED_PHASES.has(phase)) {
      return res.status(400).json({ error: 'Invalid phase_of_culture' });
    }

    const spId = Number(species_id);
    const jars = Number(number_mother_jar);
    const hasExplicitSubculture = !(
      subculture_mother_jars === undefined ||
      subculture_mother_jars === null ||
      subculture_mother_jars === ''
    );

    if (phase === 'Multiplication' && !hasExplicitSubculture) {
      return res.status(400).json({ error: 'subculture_mother_jars is required for Multiplication inventory' });
    }

    let sub = 0;
    if (phase === 'Multiplication') {
      sub = Number(subculture_mother_jars);
    } else if (hasExplicitSubculture) {
      sub = Number(subculture_mother_jars);
      if (sub !== 0) {
        return res.status(400).json({
          error: `subculture_mother_jars must be 0 or blank for ${phase} inventory`
        });
      }
    }

    if (!Number.isFinite(spId) || !Number.isFinite(sub) || !Number.isFinite(jars)) {
      return res.status(400).json({ error: 'Invalid numbers' });
    }
    if (sub < 0 || jars < 0) {
      return res.status(400).json({ error: 'Values cannot be negative' });
    }
    if (ZERO_SUBCULTURE_PHASES.has(phase) && sub !== 0) {
      return res.status(400).json({
        error: `subculture_mother_jars must be 0 for ${phase} inventory`
      });
    }

    const speciesRes = await pool.query(
      `SELECT id FROM species WHERE id = $1 AND lab_id = $2 LIMIT 1`,
      [spId, req.user.lab_id]
    );
    if (speciesRes.rowCount === 0) {
      return res.status(404).json({ error: 'Species not found for this lab' });
    }

    const exists = await pool.query(
      `SELECT id
       FROM inventory
       WHERE lab_id = $1
         AND species_id = $2
         AND phase_of_culture = $3
         AND subculture_mother_jars = $4
       LIMIT 1`,
      [req.user.lab_id, spId, phase, sub]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Inventory already exists for this species + phase + subculture' });
    }

    const ins = await pool.query(
      `
      INSERT INTO inventory (lab_id, species_id, phase_of_culture, subculture_mother_jars, number_mother_jar)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, phase_of_culture, subculture_mother_jars
      `,
      [req.user.lab_id, spId, phase, sub, jars]
    );

    return res.status(201).json({
      id: ins.rows[0].id,
      phase_of_culture: ins.rows[0].phase_of_culture,
      subculture_mother_jars: ins.rows[0].subculture_mother_jars,
      message: 'Inventory created'
    });
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
      RETURNING id, species_id, phase_of_culture, subculture_mother_jars, number_mother_jar
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
