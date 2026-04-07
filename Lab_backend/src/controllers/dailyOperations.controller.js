const pool = require('../config/db');
const { ROLE_STAFF } = require('../config/roles');

exports.getAll = async (req, res) => {
  try {
    // ✅ pagination params
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10), 1), 200);
    const offset = (page - 1) * limit;

    // ✅ filters
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

    // month format: YYYY-MM
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

    // ✅ total count
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

    // ✅ data page
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
    phase_of_culture
  } = req.body;

  const phase = phase_of_culture || 'Multiplication';
  const usedJars = Number(used_mother_jars);

  if (!Number.isFinite(usedJars) || usedJars <= 0) {
    return res.status(400).json({
      error: 'used_mother_jars must be a positive number',
      field: 'used_mother_jars'
    });
  }

  const invRes = await pool.query(
    `SELECT id, number_mother_jar FROM inventory WHERE id = $1 AND lab_id = $2`,
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
  if (usedJars > availableMotherJars) {
    return res.status(400).json({
      error: `Used mother jars (${usedJars}) cannot exceed available mother jars (${availableMotherJars})`,
      field: 'used_mother_jars',
      available_mother_jars: availableMotherJars
    });
  }

  // ✅ إذا Rooting تجاهل subculture_new_jar
  const subcultureValue = (phase === 'Rooting') ? null : subculture_new_jar;

  const { rows } = await pool.query(
    `
    INSERT INTO daily_operations
    (operations_date, employee_id, inventory_id, used_mother_jars, number_new_jars, subculture_new_jar, phase_of_culture)
    VALUES ($1::date,$2,$3,$4,$5,$6,$7)
    RETURNING
      id,
      to_char(operations_date::date, 'YYYY-MM-DD') AS operations_date,
      employee_id,
      inventory_id,
      used_mother_jars,
      number_new_jars,
      subculture_new_jar,
      phase_of_culture
    `,
    [
      operations_date,
      employee_id,
      inventory_id,
      usedJars,
      number_new_jars,
      subcultureValue,
      phase
    ]
  );

  // 🔥 Trigger يعمل تلقائيًا هنا
  res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);

    // ✅ رسالة trigger/plpgsql
    const msg = err?.message || 'Server error';

    // 400 لخطأ إدخال/منطق (مثل stock غير كافي)
    return res.status(400).json({ error: msg });
  }
  
};
