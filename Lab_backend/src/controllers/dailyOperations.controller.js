const pool = require('../config/db');
const { ROLE_STAFF } = require('../config/roles');

const ALLOWED_TARGET_PHASES = new Set([
  'Multiplication',
  'Rooting',
  'Acclimatization'
]);

const SOURCE_TO_TARGET_PHASES = {
  Initiation: new Set(['Multiplication']),
  Multiplication: new Set(['Multiplication', 'Rooting']),
  Rooting: new Set(['Acclimatization'])
};

exports.getAll = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10), 1), 200);
    const offset = (page - 1) * limit;

    const { month, employee_id, species_id, phase } = req.query;

    const params = [];
    let where = 'WHERE i.lab_id = $1';
    params.push(req.user.lab_id);

    if (req.user.role === ROLE_STAFF) {
      if (!req.user.employee_id) {
        return res.json({
          data: [],
          page,
          limit,
          total: 0,
          totalPages: 1
        });
      }

      params.push(req.user.employee_id);
      where += ` AND d.employee_id = $${params.length}`;
    }

    if (month) {
      params.push(month);
      where += ` AND to_char(d.operations_date::date, 'YYYY-MM') = $${params.length}`;
    }

    if (employee_id && req.user.role !== ROLE_STAFF) {
      params.push(Number(employee_id));
      where += ` AND d.employee_id = $${params.length}`;
    }

    if (species_id) {
      params.push(Number(species_id));
      where += ` AND s.id = $${params.length}`;
    }

    if (phase) {
      params.push(phase);
      where += ` AND d.phase_of_culture = $${params.length}`;
    }

    const countRes = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM daily_operations d
      JOIN employees e ON e.id = d.employee_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    params.push(limit);
    params.push(offset);

    const dataRes = await pool.query(
      `
      SELECT
        d.id,
        to_char(d.operations_date::date, 'YYYY-MM-DD') AS operations_date,
        d.employee_id,
        d.inventory_id,
        d.used_mother_jars,
        d.number_new_jars,
        d.subculture_new_jar,
        d.phase_of_culture,
        d.number_of_shootlets,
        d.number_of_cultured_trays,
        d.number_of_rooted_shoots,
        d.rooting_shoot_percentage,
        e.full_name,
        s.species_name,
        i.subculture_mother_jars
      FROM daily_operations d
      JOIN employees e ON e.id = d.employee_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY d.operations_date DESC, d.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    res.json({
      data: dataRes.rows,
      page,
      limit,
      total,
      totalPages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      operations_date,
      employee_id,
      inventory_id,
      used_mother_jars,
      number_new_jars,
      subculture_new_jar,
      phase_of_culture,
      number_of_shootlets,
      number_of_cultured_trays,
      number_of_rooted_shoots,
      rooting_shoot_percentage
    } = req.body;

    const phase = phase_of_culture || 'Multiplication';
    const usedJars = Number(used_mother_jars);
    const newJars = Number(number_new_jars);
    const shootlets = number_of_shootlets === undefined || number_of_shootlets === null || number_of_shootlets === ''
      ? null
      : Number(number_of_shootlets);
    const culturedTrays = number_of_cultured_trays === undefined || number_of_cultured_trays === null || number_of_cultured_trays === ''
      ? null
      : Number(number_of_cultured_trays);
    const rootedShoots = number_of_rooted_shoots === undefined || number_of_rooted_shoots === null || number_of_rooted_shoots === ''
      ? null
      : Number(number_of_rooted_shoots);

    if (!ALLOWED_TARGET_PHASES.has(phase)) {
      return res.status(400).json({
        error: 'phase_of_culture must be Multiplication, Rooting, or Acclimatization for daily operations',
        field: 'phase_of_culture'
      });
    }

    if (!Number.isFinite(usedJars) || usedJars <= 0) {
      return res.status(400).json({
        error: 'used_mother_jars must be a positive number',
        field: 'used_mother_jars'
      });
    }

    if (!Number.isFinite(newJars) || newJars < 0) {
      return res.status(400).json({
        error: 'number_new_jars must be a non-negative number',
        field: 'number_new_jars'
      });
    }

    if (shootlets !== null && (!Number.isFinite(shootlets) || shootlets < 0)) {
      return res.status(400).json({
        error: 'number_of_shootlets must be a non-negative number',
        field: 'number_of_shootlets'
      });
    }

    if (culturedTrays !== null && (!Number.isFinite(culturedTrays) || culturedTrays < 0)) {
      return res.status(400).json({
        error: 'number_of_cultured_trays must be a non-negative number',
        field: 'number_of_cultured_trays'
      });
    }

    if (rootedShoots !== null && (!Number.isFinite(rootedShoots) || rootedShoots < 0)) {
      return res.status(400).json({
        error: 'number_of_rooted_shoots must be a non-negative number',
        field: 'number_of_rooted_shoots'
      });
    }

    const invRes = await pool.query(
      `SELECT id, number_mother_jar, phase_of_culture, subculture_mother_jars
       FROM inventory
       WHERE id = $1 AND lab_id = $2`,
      [Number(inventory_id), req.user.lab_id]
    );

    if (!invRes.rows.length) {
      return res.status(404).json({
        error: 'Inventory record not found',
        field: 'inventory_id'
      });
    }

    const empRes = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND lab_id = $2`,
      [Number(employee_id), req.user.lab_id]
    );

    if (!empRes.rows.length) {
      return res.status(404).json({
        error: 'Employee not found for this lab',
        field: 'employee_id'
      });
    }

    const availableMotherJars = Number(invRes.rows[0].number_mother_jar) || 0;
    const sourcePhase = invRes.rows[0].phase_of_culture;
    const allowedTargets = SOURCE_TO_TARGET_PHASES[sourcePhase];

    if (!allowedTargets || !allowedTargets.has(phase)) {
      return res.status(400).json({
        error: `Cannot move inventory from ${sourcePhase} to ${phase}`,
        field: 'phase_of_culture',
        source_phase: sourcePhase
      });
    }

    if (usedJars > availableMotherJars) {
      return res.status(400).json({
        error: `Used mother jars (${usedJars}) cannot exceed available mother jars (${availableMotherJars})`,
        field: 'used_mother_jars',
        available_mother_jars: availableMotherJars
      });
    }

    let rootingPercentage = null;
    if (phase === 'Acclimatization') {
      if (usedJars !== newJars) {
        return res.status(400).json({
          error: 'For Acclimatization, used_mother_jars must equal number_new_jars because jars are moved into acclimatization inventory',
          field: 'number_new_jars'
        });
      }

      if (shootlets === null || culturedTrays === null || rootedShoots === null) {
        return res.status(400).json({
          error: 'Acclimatization requires number_of_shootlets, number_of_cultured_trays, and number_of_rooted_shoots',
          field: 'number_of_shootlets'
        });
      }

      if (shootlets === 0 && rootedShoots > 0) {
        return res.status(400).json({
          error: 'number_of_rooted_shoots cannot be greater than 0 when number_of_shootlets is 0',
          field: 'number_of_rooted_shoots'
        });
      }

      if (rootedShoots > shootlets) {
        return res.status(400).json({
          error: 'number_of_rooted_shoots cannot exceed number_of_shootlets',
          field: 'number_of_rooted_shoots'
        });
      }

      const suppliedPercentage = rooting_shoot_percentage === undefined || rooting_shoot_percentage === null || rooting_shoot_percentage === ''
        ? null
        : Number(rooting_shoot_percentage);

      if (suppliedPercentage !== null && (!Number.isFinite(suppliedPercentage) || suppliedPercentage < 0 || suppliedPercentage > 100)) {
        return res.status(400).json({
          error: 'rooting_shoot_percentage must be between 0 and 100',
          field: 'rooting_shoot_percentage'
        });
      }

      rootingPercentage = shootlets === 0
        ? 0
        : Number(((rootedShoots / shootlets) * 100).toFixed(2));
    }

    const isTerminalPhase = phase === 'Rooting' || phase === 'Acclimatization';
    const subcultureValue = isTerminalPhase ? null : (subculture_new_jar === '' ? null : subculture_new_jar);

    const { rows } = await pool.query(
      `
      INSERT INTO daily_operations
      (
        operations_date,
        employee_id,
        inventory_id,
        used_mother_jars,
        number_new_jars,
        subculture_new_jar,
        phase_of_culture,
        number_of_shootlets,
        number_of_cultured_trays,
        number_of_rooted_shoots,
        rooting_shoot_percentage
      )
      VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING
        id,
        to_char(operations_date::date, 'YYYY-MM-DD') AS operations_date,
        employee_id,
        inventory_id,
        used_mother_jars,
        number_new_jars,
        subculture_new_jar,
        phase_of_culture,
        number_of_shootlets,
        number_of_cultured_trays,
        number_of_rooted_shoots,
        rooting_shoot_percentage
      `,
      [
        operations_date,
        employee_id,
        inventory_id,
        usedJars,
        newJars,
        subcultureValue,
        phase,
        shootlets,
        culturedTrays,
        rootedShoots,
        rootingPercentage
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    const msg = err?.message || 'Server error';
    return res.status(400).json({ error: msg });
  }
};
