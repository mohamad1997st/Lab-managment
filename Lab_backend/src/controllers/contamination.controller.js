const pool = require('../config/db');
const { ROLE_STAFF } = require('../config/roles');

exports.getAll = async (req, res) => {
  try {
    const { employee_id, species_id } = req.query;

    const params = [req.user.lab_id];
    let where = 'WHERE i.lab_id = $1';

    if (req.user.role === ROLE_STAFF) {
      if (!req.user.employee_id) {
        return res.json([]);
      }

      params.push(req.user.employee_id);
      where += ` AND c.employee_id = $${params.length}`;
    } else if (employee_id) {
      params.push(Number(employee_id));
      where += ` AND c.employee_id = $${params.length}`;
    }

    if (species_id) {
      params.push(Number(species_id));
      where += ` AND s.id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        c.id,
        c.employee_id,
        to_char(c.detected_date::date, 'YYYY-MM-DD') AS detected_date,
        to_char(d.operations_date::date, 'YYYY-MM-DD') AS operations_date,
        d.number_new_jars AS produced_jars,
        i.subculture_mother_jars,
        d.subculture_new_jar,
        c.contaminated_jars,
        c.contamination_type,
        c.notes,
        CASE
          WHEN e.is_active THEN e.full_name
          ELSE ('Former employee #' || e.id)
        END AS full_name,
        s.species_name
      FROM contamination_records c
      JOIN employees e ON e.id = c.employee_id
      JOIN daily_operations d ON d.id = c.operation_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY c.detected_date DESC, c.id DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
exports.create = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      operation_id,
      employee_id,
      detected_date,
      contaminated_jars,
      contamination_type,
      notes
    } = req.body;

    const append =
      String(req.query?.append ?? '').toLowerCase() === 'true' || req.body?.append === true;

    const opId = Number(operation_id);
    const empId = Number(employee_id);
    const contaminated = Number(contaminated_jars);

    if (
      !Number.isFinite(opId) ||
      !Number.isFinite(empId) ||
      !detected_date ||
      !Number.isFinite(contaminated) ||
      !contamination_type
    ) {
      return res.status(400).json({ error: 'Missing/invalid contamination fields.' });
    }

    await client.query('BEGIN');

    const ownership = await client.query(
      `
      SELECT
        d.id
      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      WHERE d.id = $1 AND i.lab_id = $2
      `,
      [opId, req.user.lab_id]
    );

    if (ownership.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Operation not found for this lab.' });
    }

    const employeeOwnership = await client.query(
      `SELECT id FROM employees WHERE id = $1 AND lab_id = $2 AND is_active = true`,
      [empId, req.user.lab_id]
    );

    if (employeeOwnership.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee not found for this lab.' });
    }

    if (!append) {
      // If a record already exists for this operation_id, update it instead of inserting a new row.
      // This lets the user "edit" the contamination for the same operation without creating duplicates.
      const updated = await client.query(
        `
        WITH target AS (
          SELECT id
          FROM contamination_records
          WHERE operation_id = $1
          ORDER BY id DESC
          LIMIT 1
        )
        UPDATE contamination_records c
        SET
          employee_id = $2,
          detected_date = $3::date,
          contaminated_jars = $4,
          contamination_type = $5,
          notes = $6
        WHERE c.id = (SELECT id FROM target)
        RETURNING
          c.id,
          c.operation_id,
          c.employee_id,
          to_char(c.detected_date::date, 'YYYY-MM-DD') AS detected_date,
          (SELECT d.number_new_jars FROM daily_operations d WHERE d.id = c.operation_id) AS produced_jars,
          c.contaminated_jars,
          c.contamination_type,
          c.notes
        `,
        [opId, empId, detected_date, contaminated, contamination_type, notes ?? null]
      );

      if (updated.rows.length > 0) {
        await client.query('COMMIT');
        return res.status(200).json(updated.rows[0]);
      }
    }

    const inserted = await client.query(
      `
      INSERT INTO contamination_records
      (operation_id, employee_id, detected_date, contaminated_jars, contamination_type, notes)
      VALUES ($1,$2,$3::date,$4,$5,$6)
      RETURNING
        id,
        operation_id,
        employee_id,
        to_char(detected_date::date, 'YYYY-MM-DD') AS detected_date,
        (SELECT d.number_new_jars FROM daily_operations d WHERE d.id = contamination_records.operation_id) AS produced_jars,
        contaminated_jars,
        contamination_type,
        notes
      `,
      [opId, empId, detected_date, contaminated, contamination_type, notes ?? null]
    );

    await client.query('COMMIT');
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }

    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Duplicate key violation.',
        details: err.detail
      });
    }

    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
