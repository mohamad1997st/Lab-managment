const pool = require('../config/db');
const { newDoc, header, drawTable } = require('../services/report.service');

function getDateRange(req) {
  const from = req.query.from;
  const to = req.query.to;
  return { from, to };
}

exports.inventoryPDF = async (req, res) => {
  try {
    const { species_id } = req.query;
    const labId = req.user.lab_id;
    const normalizedView = String(req.query.view || req.query.status || 'all').trim().toLowerCase();
    const viewMode = ['all', 'active', 'empty'].includes(normalizedView) ? normalizedView : 'all';

    const docNameParts = ['Inventory_Report', viewMode.toUpperCase()];
    if (species_id) docNameParts.push(`SPECIES_${species_id}`);
    const doc = newDoc(res, docNameParts.join('_'));

    let speciesName = null;
    if (species_id) {
      const sp = await pool.query(
        `SELECT species_name FROM species WHERE id = $1 AND lab_id = $2`,
        [Number(species_id), labId]
      );
      speciesName = sp.rows[0]?.species_name || `ID ${species_id}`;
    }

    const subtitleParts = [`Generated: ${new Date().toLocaleString()}`];
    subtitleParts.push(`View: ${viewMode}`);
    if (speciesName) subtitleParts.push(`Species: ${speciesName}`);

    header(doc, 'Inventory Report', subtitleParts.join('  |  '));

    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    if (species_id) {
      params.push(Number(species_id));
      where += ` AND s.id = $${params.length}`;
    }

    if (viewMode === 'active') where += ` AND COALESCE(i.number_mother_jar, 0) > 0`;
    if (viewMode === 'empty') where += ` AND COALESCE(i.number_mother_jar, 0) <= 0`;

    const { rows } = await pool.query(
      `
      SELECT s.species_name, i.subculture_mother_jars, i.number_mother_jar
      FROM inventory i
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY s.species_name, i.subculture_mother_jars
      `,
      params
    );

    if (!rows.length) {
      doc.moveDown(1);
      doc.fontSize(12).text('No inventory data found.', { align: 'center' });
      doc.end();
      return;
    }

    const tableRows = rows.map((r) => [
      r.species_name,
      r.subculture_mother_jars,
      r.number_mother_jar
    ]);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    drawTable(doc, ['Species', 'Subculture', 'Jars'], tableRows, {
      colWidths: [pageW * 0.5, pageW * 0.22, pageW * 0.28],
      rowH: 24,
      rowFill: (cells) => {
        const jars = Number(cells?.[2] ?? 0);
        if (!Number.isFinite(jars)) return null;
        if (jars <= 0) return '#FFCDD2';
        if (jars < 300) return '#FFF9C4';
        if (jars >= 300) return '#C8E6C9';
        return null;
      }
    });

    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const legendH = 54;
    if (doc.y + legendH > pageBottom) doc.addPage();

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Legend:');
    doc.font('Helvetica').fontSize(9).fillColor('#333');

    const drawLegendItem = (label, color) => {
      const x = doc.x;
      const y = doc.y + 2;
      doc.save();
      doc.fillColor(color);
      doc.rect(x, y, 10, 10).fill();
      doc.restore();
      doc.fillColor('#333').text(label, x + 14, doc.y);
    };

    drawLegendItem('Empty (0)', '#FFCDD2');
    drawLegendItem('Low (1 - 299)', '#FFF9C4');
    drawLegendItem('High (>= 300)', '#C8E6C9');
    doc.fillColor('black');
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.productionByEmployeePDF = async (req, res) => {
  try {
    const { from, to } = getDateRange(req);
    const labId = req.user.lab_id;
    const doc = newDoc(res, 'Production_By_Employee');

    header(
      doc,
      'Production by Employee',
      from && to ? `From: ${from}  To: ${to}` : `Generated: ${new Date().toLocaleString()}`
    );

    const params = [labId];
    let where = 'WHERE e.lab_id = $1';
    if (from && to) {
      params.push(from, to);
      where += ` AND d.operations_date::date BETWEEN $2::date AND $3::date`;
    }

    const { rows } = await pool.query(
      `
      SELECT e.full_name,
             COALESCE(SUM(d.number_new_jars), 0)::int AS total_new_jars
      FROM employees e
      LEFT JOIN daily_operations d
        ON d.employee_id = e.id
      ${where}
      GROUP BY e.full_name
      ORDER BY e.full_name
      `,
      params
    );

    const tableRows = rows.map((r) => [r.full_name, r.total_new_jars]);
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    drawTable(doc, ['Employee', 'Total New Jars'], tableRows, {
      colWidths: [pageW * 0.72, pageW * 0.28],
      rowH: 24
    });
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.contaminationByEmployeePDF = async (req, res) => {
  try {
    const { from, to } = getDateRange(req);
    const labId = req.user.lab_id;
    const doc = newDoc(res, 'Contamination_By_Employee');

    header(
      doc,
      'Contamination by Employee',
      from && to ? `From: ${from}  To: ${to}` : `Generated: ${new Date().toLocaleString()}`
    );

    const params = [labId];
    let where = 'WHERE e.lab_id = $1';
    if (from && to) {
      params.push(from, to);
      where += ` AND c.detected_date::date BETWEEN $2::date AND $3::date`;
    }

    const { rows } = await pool.query(
      `
      SELECT e.full_name,
             COALESCE(SUM(c.contaminated_jars), 0)::int AS total_contaminated
      FROM employees e
      LEFT JOIN contamination_records c
        ON c.employee_id = e.id
      ${where}
      GROUP BY e.full_name
      ORDER BY e.full_name
      `,
      params
    );

    const tableRows = rows.map((r) => [r.full_name, r.total_contaminated]);
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    drawTable(doc, ['Employee', 'Total Contaminated Jars'], tableRows, {
      colWidths: [pageW * 0.72, pageW * 0.28],
      rowH: 24
    });
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
