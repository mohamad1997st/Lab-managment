const pool = require('../config/db');
const { ROLE_STAFF } = require('../config/roles');

exports.employeePerformance = async (req, res) => {
  try {
    const { from, to } = req.query;

    const params = [req.user.lab_id];
    let where = 'WHERE e.lab_id = $1';

    if (req.user.role === ROLE_STAFF) {
      if (!req.user.employee_id) {
        return res.json({ from: from || null, to: to || null, rows: [] });
      }

      params.push(req.user.employee_id);
      where += ` AND d.employee_id = $${params.length}`;
    }

    if (from) {
      params.push(from);
      where += ` AND d.operations_date::date >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND d.operations_date::date <= $${params.length}::date`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        to_char(d.operations_date::date, 'YYYY-MM') AS month,
        d.employee_id,
        CASE
          WHEN e.is_active THEN e.full_name
          ELSE ('Former employee #' || e.id)
        END AS full_name,
        COUNT(*)::int AS operations,
        COALESCE(SUM(d.used_mother_jars), 0)::int AS used_mother_jars,
        COALESCE(SUM(d.number_new_jars), 0)::int AS new_jars
      FROM daily_operations d
      JOIN employees e ON e.id = d.employee_id
      ${where}
      GROUP BY
        month,
        d.employee_id,
        CASE
          WHEN e.is_active THEN e.full_name
          ELSE ('Former employee #' || e.id)
        END
      ORDER BY
        month,
        CASE
          WHEN e.is_active THEN e.full_name
          ELSE ('Former employee #' || e.id)
        END
      `,
      params
    );

    return res.json({ from: from || null, to: to || null, rows });
  } catch (err) {
    console.error('employeePerformance error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};

exports.speciesUpgradePerformance = async (req, res) => {
  try {
    if (req.user.role === ROLE_STAFF) {
      return res.status(403).json({ error: 'Staff can only view their own work performance' });
    }

    const { from, to } = req.query;

    const params = [req.user.lab_id];
    let where = 'WHERE i.lab_id = $1';

    if (from) {
      params.push(from);
      where += ` AND d.operations_date::date >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND d.operations_date::date <= $${params.length}::date`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        to_char(d.operations_date::date, 'YYYY-MM') AS month,
        s.id AS species_id,
        s.species_name,
        COUNT(*) FILTER (
          WHERE d.subculture_new_jar IS NOT NULL
            AND d.subculture_new_jar > i.subculture_mother_jars
        )::int AS upgrades,
        COALESCE(SUM(d.used_mother_jars), 0)::int AS used_mother_jars,
        COALESCE(SUM(d.number_new_jars), 0)::int AS new_jars
      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      GROUP BY month, s.id, s.species_name
      ORDER BY month, s.species_name
      `,
      params
    );

    return res.json({ from: from || null, to: to || null, rows });
  } catch (err) {
    console.error('speciesUpgradePerformance error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
