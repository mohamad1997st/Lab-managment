const pool = require('../config/db');
const { ROLE_STAFF } = require('../config/roles');

// GET /api/inventory-adjustments?date=YYYY-MM-DD&employee_id=..&species_id=..&type=..&page=1&limit=30
exports.getAll = async (req, res) => {
  const {
    date,
    employee_id,
    species_id,
    type,
    page = 1,
    limit = 30
  } = req.query;

  const p = Math.max(1, Number(page));
  const l = Math.min(200, Math.max(1, Number(limit)));
  const offset = (p - 1) * l;

  const params = [req.user.lab_id];
  let where = 'WHERE i.lab_id = $1';

  if (req.user.role === ROLE_STAFF) {
    if (!req.user.employee_id) {
      return res.json({
        data: [],
        total: 0,
        page: p,
        limit: l,
        totalPages: 0
      });
    }

    params.push(req.user.employee_id);
    where += ` AND a.employee_id = $${params.length}`;
  }

  if (date) {
    params.push(date);
    where += ` AND a.adjustment_date = $${params.length}::date`;
  }
  if (employee_id && req.user.role !== ROLE_STAFF) {
    params.push(Number(employee_id));
    where += ` AND a.employee_id = $${params.length}`;
  }
  if (species_id) {
    params.push(Number(species_id));
    where += ` AND s.id = $${params.length}`;
  }
  if (type) {
    params.push(type);
    where += ` AND a.type = $${params.length}`;
  }

  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM inventory_adjustments a
    JOIN inventory i ON i.id = a.inventory_id
    JOIN species s ON s.id = i.species_id
    ${where}
    `,
    params
  );

  params.push(l);
  params.push(offset);

  const dataRes = await pool.query(
    `
    SELECT
      a.*,
      to_char(a.adjustment_date, 'YYYY-MM-DD') AS adjustment_date,
      CASE
        WHEN e.is_active THEN e.full_name
        ELSE ('Former employee #' || e.id)
      END AS full_name,
      s.species_name,
      i.subculture_mother_jars
    FROM inventory_adjustments a
    JOIN inventory i ON i.id = a.inventory_id
    JOIN species s ON s.id = i.species_id
    LEFT JOIN employees e ON e.id = a.employee_id
    ${where}
    ORDER BY a.adjustment_date DESC, a.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  const total = countRes.rows[0]?.total || 0;
  res.json({
    data: dataRes.rows,
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l)
  });
};

exports.create = async (req, res) => {
  const {
    adjustment_date,
    inventory_id,
    employee_id,
    type,
    qty,
    notes
  } = req.body;

  const inventoryRes = await pool.query(
    `SELECT id FROM inventory WHERE id = $1 AND lab_id = $2`,
    [Number(inventory_id), req.user.lab_id]
  );

  if (inventoryRes.rowCount === 0) {
    return res.status(404).json({ error: 'Inventory not found for this lab' });
  }

  if (employee_id) {
    const employeeRes = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND lab_id = $2 AND is_active = true`,
      [Number(employee_id), req.user.lab_id]
    );

    if (employeeRes.rowCount === 0) {
      return res.status(404).json({ error: 'Employee not found for this lab' });
    }
  }

  const { rows } = await pool.query(
    `
    INSERT INTO inventory_adjustments
      (adjustment_date, inventory_id, employee_id, type, qty, notes)
    VALUES
      ($1::date, $2::int, $3::int, $4::text, $5::int, $6::text)
    RETURNING *,
      to_char(adjustment_date, 'YYYY-MM-DD') AS adjustment_date
    `,
    [
      adjustment_date,
      Number(inventory_id),
      employee_id ? Number(employee_id) : null,
      type,
      Number(qty),
      notes || null
    ]
  );

  res.status(201).json(rows[0]);
};

exports.remove = async (req, res) => {
  const id = Number(req.params.id);

  const del = await pool.query(
    `
    DELETE FROM inventory_adjustments a
    USING inventory i
    WHERE a.id = $1
      AND i.id = a.inventory_id
      AND i.lab_id = $2
    RETURNING a.id
    `,
    [id, req.user.lab_id]
  );

  if (del.rowCount === 0) return res.status(404).json({ error: 'Not found' });

  res.json({ message: 'Deleted', id: del.rows[0].id });
};
