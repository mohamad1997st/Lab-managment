const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { newDoc, header, drawTable, attachLogo } = require('../services/report.service');
const WORD_A4_MARGIN = 72;
const DOC_TITLE_FONT = 'Helvetica-Bold';
const DOC_BODY_FONT = 'Times-Roman';
const DOC_BODY_BOLD_FONT = 'Times-Bold';
const DOC_TITLE_COLOR = '#111827';
const DOC_SUBTITLE_COLOR = '#4B5563';
const DOC_HEADER_FILL = '#F3F4F6';
const DOC_ZEBRA_FILL = '#FAFAFA';
const DOC_BORDER_COLOR = '#D1D5DB';

function setupPdf(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: WORD_A4_MARGIN, size: 'A4', layout: 'landscape' });
  doc.pipe(res);
  attachLogo(doc);
  return doc;
}
exports.inventoryPdf = async (req, res) => {
  try {
    const { species_id, view } = req.query;
    const labId = req.user.lab_id;

    const normalizedView = String(view || 'split').trim().toLowerCase();
    const viewMode = ['split', 'all', 'active', 'empty'].includes(normalizedView) ? normalizedView : 'split';

    // ✅ اسم ملف مختلف لتفادي cache + يبين الفلتر
    const filenameParts = ['inventory'];
    if (species_id) filenameParts.push(`species_${species_id}`);
    if (viewMode !== 'all') filenameParts.push(viewMode);
    const filename = `${filenameParts.join('_')}.pdf`;
    const doc = setupPdf(res, filename);

    // ✅ جلب اسم الـ species إذا في فلتر
    let speciesName = null;
    if (species_id) {
      const sp = await pool.query(
        `SELECT species_name FROM species WHERE id = $1 AND lab_id = $2`,
        [Number(species_id), labId]
      );
      speciesName = sp.rows[0]?.species_name || `ID ${species_id}`;
    }

    doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Inventory Report', { align: 'center' });
    if (species_id) {
      doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(`Species: ${speciesName}`, { align: 'center' });
    }
    doc.fillColor('black');
    doc.moveDown(1);

    // ✅ فلترة SQL
    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    if (species_id) {
      params.push(Number(species_id));
      where += ` AND s.id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT i.id, s.species_name, i.subculture_mother_jars, i.number_mother_jar
      FROM inventory i
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY s.species_name, i.subculture_mother_jars
      `,
      params
    );

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

    const headerH = 20;
    const rowH = 18;

    const cols = [
      pageW * 0.10, // ID
      pageW * 0.55, // Species
      pageW * 0.15, // Subculture
      pageW * 0.20  // Jars
    ];

    const headers = ['ID', 'Species', 'Subculture', 'Jars'];

    const bottomY = () => doc.page.height - doc.page.margins.bottom;

    const ensureSpace = (needed) => {
      if (doc.y + needed > bottomY()) {
        doc.addPage();
        return true;
      }
      return false;
    };

    const toJarsNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const drawHeader = (y) => {
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageW, headerH).fill();
      doc.restore();

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(9.5).fillColor(DOC_TITLE_COLOR);

      let x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 4, y + 6, { width: cols[i] - 8, ellipsis: true });
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }
      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
    };

    const drawRow = (y, r, idx) => {
      const jars = toJarsNumber(r.number_mother_jar);
      const isZero = jars === 0;

      // ✅ خلفية أحمر إذا صفر
      if (isZero) {
        doc.save();
        doc.fillColor('#FFCDD2');
        doc.rect(startX, y, pageW, rowH).fill();
        doc.restore();
      } else if (idx % 2 === 1) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageW, rowH).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, rowH).stroke();

      const values = [r.id, r.species_name, r.subculture_mother_jars, jars];

      doc.font(DOC_BODY_FONT).fontSize(10);

      let x = startX;
      for (let i = 0; i < values.length; i++) {
        const align = (i === 3 || i === 2) ? 'right' : 'left';

        doc.fillColor(DOC_TITLE_COLOR);
        doc.text(String(values[i]), x + 4, y + 5, {
          width: cols[i] - 8,
          align,
          ellipsis: true
        });

        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      }

      doc.fillColor('black').strokeColor('black');
    };

    if (rows.length === 0) {
      doc.fontSize(12).text('No inventory data found.', { align: 'center' });
      doc.end();
      return;
    }

    const activeRows = rows.filter(r => toJarsNumber(r.number_mother_jar) > 0);
    const emptyRows = rows.filter(r => toJarsNumber(r.number_mother_jar) <= 0);

    doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(
      `All: ${rows.length}   Active: ${activeRows.length}   Empty: ${emptyRows.length}`,
      { align: 'center' }
    );
    doc.fillColor('black');
    doc.moveDown(1);

    const renderSection = (title, sectionRows) => {
      if (ensureSpace(28)) {
        doc.y = doc.page.margins.top;
      }

      doc.font(DOC_BODY_BOLD_FONT).fontSize(12).fillColor(DOC_TITLE_COLOR).text(
        `${title} (${sectionRows.length})`,
        startX,
        doc.y,
        { width: pageW }
      );
      doc.moveDown(0.4);

      if (sectionRows.length === 0) {
        doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text('No records.', startX, doc.y);
        doc.fillColor('black');
        doc.moveDown(1);
        return;
      }

      if (ensureSpace(headerH + rowH)) {
        doc.y = doc.page.margins.top;
      }

      drawHeader(doc.y);
      doc.y += headerH;

      sectionRows.forEach((r, idx) => {
        if (ensureSpace(rowH)) {
          doc.y = doc.page.margins.top;
          drawHeader(doc.y);
          doc.y += headerH;
        }
        drawRow(doc.y, r, idx);
        doc.y += rowH;
      });

      doc.moveDown(1);
    };

    if (viewMode === 'all') {
      renderSection('All', rows);
    } else if (viewMode === 'active') {
      renderSection('Active', activeRows);
    } else if (viewMode === 'empty') {
      renderSection('Empty', emptyRows);
    } else {
      renderSection('All', rows);
      renderSection('Active', activeRows);
      renderSection('Empty', emptyRows);
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
exports.productionPdf = async (req, res) => {
  const labId = req.user.lab_id;
  const doc = setupPdf(res, 'production.pdf');

  doc.fontSize(18).text('Production Report (Daily Operations)', { align: 'center' });
  doc.moveDown();

  // عمليات الإنتاج + أسماء الموظف والنبتة
  const { rows } = await pool.query(`
    SELECT
      d.id,
      d.operations_date,
      d.phase_of_culture,
      e.full_name,
      s.species_name,
      i.subculture_mother_jars,
      d.used_mother_jars,
      d.number_new_jars,
      d.subculture_new_jar
    FROM daily_operations d
    JOIN employees e ON e.id = d.employee_id
    JOIN inventory i ON i.id = d.inventory_id
    JOIN species s ON s.id = i.species_id
    WHERE i.lab_id = $1
    ORDER BY d.operations_date DESC, d.id DESC
  `, [labId]);

  if (!rows.length) {
    doc.fontSize(12).text('No production data found.', { align: 'center' });
    doc.end();
    return;
  }

  const tableHeaders = [
    'ID',
    'Date',
    'Phase',
    'Employee',
    'Species',
    'Subculture',
    'Used',
    'New',
    'New Sub'
  ];

  const tableRows = rows.map(r => [
    r.id,
    String(r.operations_date).slice(0, 10),
    r.phase_of_culture || '-',
    r.full_name,
    r.species_name,
    r.subculture_mother_jars,
    r.used_mother_jars,
    r.number_new_jars,
    r.subculture_new_jar ?? '-'
  ]);

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = Math.floor(pageW / tableHeaders.length);
  drawTable(doc, tableHeaders, tableRows, { rowH: 20, colW });

  doc.end();
};
exports.contaminationPdf = async (req, res) => {
  const labId = req.user.lab_id;
  const doc = setupPdf(res, 'contamination.pdf');

  doc.fontSize(18).text('Contamination Report', { align: 'center' });
  doc.moveDown();

  // عدّل اسم جدول التلوث حسب جدولك الحقيقي:
  // contamination_records (operation_id, employee_id, detected_date, contaminated_jars, ...)
  const { rows } = await pool.query(`
    SELECT
      c.id,
      c.detected_date,
      c.contaminated_jars,
      e.full_name,
      d.id as operation_id,
      s.species_name
    FROM contamination_records c
    JOIN employees e ON e.id = c.employee_id
    JOIN daily_operations d ON d.id = c.operation_id
    JOIN inventory i ON i.id = d.inventory_id
    JOIN species s ON s.id = i.species_id
    WHERE i.lab_id = $1
    ORDER BY c.detected_date DESC, c.id DESC
  `, [labId]);

  if (!rows.length) {
    doc.fontSize(12).text('No contamination data found.', { align: 'center' });
    doc.end();
    return;
  }

  const tableHeaders = ['ID', 'Date', 'Employee', 'Species', 'Operation ID', 'Contaminated'];
  const tableRows = rows.map(r => [
    r.id,
    String(r.detected_date).slice(0, 10),
    r.full_name,
    r.species_name,
    r.operation_id,
    r.contaminated_jars
  ]);

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = Math.floor(pageW / tableHeaders.length);
  drawTable(doc, tableHeaders, tableRows, { rowH: 20, colW });

  doc.end();
};
exports.productionBySpeciesPdf = async (req, res) => {
  const PDFDocument = require('pdfkit');
  const pool = require('../config/db');

  const { species_id, month, year, include_rooting, details } = req.query;
  const labId = req.user.lab_id;

  // فلترة اختيارية
  const params = [labId];
  let where = 'WHERE i.lab_id = $1';

  if (species_id) {
    params.push(Number(species_id));
    where += ` AND s.id = $${params.length}`;
  }

  if (month && year) {
    params.push(Number(month));
    params.push(Number(year));
    where += ` AND EXTRACT(MONTH FROM d.operations_date) = $${params.length - 1}
               AND EXTRACT(YEAR FROM d.operations_date) = $${params.length}`;
  }

  // افتراضياً نستثني Rooting (إذا بدك تضمّنه: include_rooting=true)
  if (include_rooting !== 'true') {
    where += ` AND (d.phase_of_culture IS NULL OR d.phase_of_culture NOT IN ('Rooting','Acclimatization'))`;
  }

  // إعداد PDF
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="production_by_species.pdf"');

  const doc = new PDFDocument({
    margin: WORD_A4_MARGIN,
    size: 'A4',
    layout: 'landscape' // ✅ يقلل عدد الصفحات
  });
  doc.pipe(res);
  attachLogo(doc);

  // Title
  doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Production Report by Species', { align: 'center' });
  doc.font(DOC_BODY_FONT).fillColor('black').moveDown(0.4);

  const subtitleParts = [];
  if (species_id) subtitleParts.push(`Species ID: ${species_id}`);
  if (month && year) subtitleParts.push(`Period: ${month}/${year}`);
  if (include_rooting === 'true') subtitleParts.push('Including Rooting');
  if (details === 'true') subtitleParts.push('Details: ON');
  else subtitleParts.push('Details: OFF');

  doc.font(DOC_BODY_FONT).fontSize(10).fillColor(DOC_SUBTITLE_COLOR).text(subtitleParts.join(' | '), { align: 'center' });
  doc.fillColor('black');
  doc.moveDown(0.8);

  // -----------------------------
  // Helpers (Tables)
  // -----------------------------
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;

  const headerH = 16;
  const rowH = 16;

  const ensureSpace = (neededHeight) => {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + neededHeight > bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      return true; // page break happened
    }
    return false;
  };

  const drawHeaderRow = (y, cols, titles) => {
    // Background
    doc.save();
    doc.fillColor(DOC_HEADER_FILL);
    doc.rect(startX, y, pageWidth, headerH).fill();
    doc.restore();

    // Border
    doc.lineWidth(0.5);
    doc.strokeColor(DOC_BORDER_COLOR);
    doc.rect(startX, y, pageWidth, headerH).stroke();

    let x = startX;
    doc.font(DOC_BODY_BOLD_FONT).fontSize(9).fillColor(DOC_TITLE_COLOR);

    for (let i = 0; i < cols.length; i++) {
      const w = cols[i];
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      doc.text(titles[i], x + 4, y + 4, {
        width: w - 8,
        height: Math.max(0, headerH - 8),
        align: 'left',
        lineBreak: false,
        ellipsis: true
      });
      x += w;
    }

    doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
  };

  const drawDataRow = (y, cols, cells, opts = {}) => {
    // Zebra background
    if (opts.zebra) {
      doc.save();
      doc.fillColor(DOC_ZEBRA_FILL);
      doc.rect(startX, y, pageWidth, rowH).fill();
      doc.restore();
    }

    // Border
    doc.lineWidth(0.5);
    doc.strokeColor(DOC_BORDER_COLOR);
    doc.rect(startX, y, pageWidth, rowH).stroke();

    let x = startX;
    doc.font(DOC_BODY_FONT).fontSize(9.5);

    for (let i = 0; i < cols.length; i++) {
      const w = cols[i];
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + rowH).stroke();

      const cell = cells[i];

      if (typeof cell === 'object' && cell !== null) {
        doc.fillColor(cell.color || 'black');
        doc.text(cell.text ?? '', x + 4, y + 4, {
          width: w - 8,
          height: Math.max(0, rowH - 8),
          align: cell.align || 'left',
          lineBreak: false,
          ellipsis: true
        });
        doc.fillColor('black');
      } else {
        doc.fillColor('black');
        doc.text(String(cell ?? ''), x + 4, y + 4, {
          width: w - 8,
          align: 'left',
          height: Math.max(0, rowH - 8),
          lineBreak: false,
          ellipsis: true
        });
      }

      x += w;
    }
  };

  // =========================================
  // 1) SUMMARY
  // =========================================
  const summary = await pool.query(
    `
    SELECT
      s.id AS species_id,
      s.species_name,
      COUNT(*) AS operations_count,
      SUM(d.used_mother_jars)::int AS total_used_mother_jars,
      SUM(d.number_new_jars)::int AS total_produced_jars
    FROM daily_operations d
    JOIN inventory i ON i.id = d.inventory_id
    JOIN species s ON s.id = i.species_id
    ${where}
    GROUP BY s.id, s.species_name
    ORDER BY s.species_name
    `,
    params
  );

  doc.font(DOC_BODY_BOLD_FONT).fontSize(12).fillColor(DOC_TITLE_COLOR).text('Summary', { underline: true });
  doc.font(DOC_BODY_FONT).fillColor('black').moveDown(0.4);

  if (summary.rows.length === 0) {
    doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text('No production data found for these filters.');
    doc.end();
    return;
  }

  const sumCols = [
    pageWidth * 0.50, // Species
    pageWidth * 0.10, // Ops
    pageWidth * 0.20, // Total Used
    pageWidth * 0.20  // Total Produced
  ];

  let y = doc.y;

  ensureSpace(headerH);
  drawHeaderRow(y, sumCols, ['Species', 'Ops', 'Total Used', 'Total Produced']);
  y += headerH;
  doc.y = y;

  summary.rows.forEach((r, idx) => {
    if (ensureSpace(rowH)) {
      // repeat header after page break
      y = doc.y;
      drawHeaderRow(y, sumCols, ['Species', 'Ops', 'Total Used', 'Total Produced']);
      y += headerH;
      doc.y = y;
    }

    drawDataRow(
      y,
      sumCols,
      [
        `${r.species_name} (ID ${r.species_id})`,
        String(r.operations_count),
        String(r.total_used_mother_jars),
        String(r.total_produced_jars)
      ],
      { zebra: idx % 2 === 1 }
    );

    y += rowH;
    doc.y = y;
  });

  // ✅ إذا ما طلب details=true نكتفي بالـ Summary
  // =========================================
  // 2) DETAILS (Optional)
  // =========================================
  doc.addPage();

  const detailsRows = await pool.query(
    `
    SELECT
      s.species_name,
      d.id,
      d.operations_date,
      d.phase_of_culture,
      e.full_name,
      i.subculture_mother_jars,
      d.used_mother_jars,
      d.number_new_jars,
      d.subculture_new_jar
    FROM daily_operations d
    JOIN employees e ON e.id = d.employee_id
    JOIN inventory i ON i.id = d.inventory_id
    JOIN species s ON s.id = i.species_id
    ${where}
    ORDER BY s.species_name, d.operations_date DESC, d.id DESC
    `,
    params
  );

  doc.font(DOC_BODY_BOLD_FONT).fontSize(12).fillColor(DOC_TITLE_COLOR).text('Details', { underline: true, aling: 'left' });
  doc.font(DOC_BODY_FONT).fillColor('black').moveDown(0.4);

  const detCols = [
    pageWidth * 0.10, // Date
    pageWidth * 0.14, // Phase
    pageWidth * 0.22, // Employee
    pageWidth * 0.10, // MotherSub
    pageWidth * 0.08, // Used
    pageWidth * 0.08, // New
    pageWidth * 0.10, // NewSub
    pageWidth * 0.18  // Operation ID
  ];

  const detHeaderTitles = ['Date', 'Phase', 'Employee', 'MotherSub', 'Used', 'New', 'NewSub', 'Op ID'];

  y = doc.y;
  doc.y = y;

  let currentSpecies = null;
  let zebra = false;

  const drawSpeciesSectionHeader = (name) => {
    if (ensureSpace(40)) {
      y = doc.y;
    }

    doc.moveDown(0.4);
    doc.font(DOC_BODY_BOLD_FONT).fontSize(10.5).fillColor(DOC_TITLE_COLOR).text(name, { underline: true });
    doc.font(DOC_BODY_FONT).fontSize(9.5).fillColor('black');

    y = doc.y + 4;
    doc.y = y;

    if (ensureSpace(headerH)) {
      y = doc.y;
    }

    drawHeaderRow(y, detCols, detHeaderTitles);
    y += headerH;
    doc.y = y;

    zebra = false;
  };

  detailsRows.rows.forEach((r) => {
    if (currentSpecies !== r.species_name) {
      currentSpecies = r.species_name;
      drawSpeciesSectionHeader(currentSpecies);
    }

    if (ensureSpace(rowH)) {
      y = doc.y;
      // repeat header after page break
      drawHeaderRow(y, detCols, detHeaderTitles);
      y += headerH;
      doc.y = y;
    }

    const dateStr = String(r.operations_date).slice(0, 10);

    const employeeCell = {
      text: r.full_name,
      color: '#1565C0', // ✅ لون مختلف لاسم الموظف
      align: 'left'
    };

    drawDataRow(
      y,
      detCols,
      [
        dateStr,
        r.phase_of_culture || '-',
        employeeCell,
        String(r.subculture_mother_jars),
        String(r.used_mother_jars),
        String(r.number_new_jars),
        r.subculture_new_jar == null ? '-' : String(r.subculture_new_jar),
        `#${r.id}`
      ],
      { zebra }
    );

    zebra = !zebra;
    y += rowH;
    doc.y = y;
  });

  doc.end();
};
exports.productionSummaryByPhasePdf = async (req, res) => {
  try {
    const { month, year } = req.query;
    const labId = req.user.lab_id;

    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    if (month && year) {
      params.push(Number(month));
      params.push(Number(year));
      where += ` AND EXTRACT(MONTH FROM d.operations_date) = $2
                AND EXTRACT(YEAR FROM d.operations_date) = $3`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        s.species_name,

        COALESCE(SUM(d.used_mother_jars) FILTER (WHERE d.phase_of_culture = 'Multiplication'),0)::int AS used_mul,
        COALESCE(SUM(d.number_new_jars) FILTER (WHERE d.phase_of_culture = 'Multiplication'),0)::int AS new_mul,

        COALESCE(SUM(d.used_mother_jars) FILTER (WHERE d.phase_of_culture = 'Rooting'),0)::int AS used_root,
        COALESCE(SUM(d.number_new_jars) FILTER (WHERE d.phase_of_culture = 'Rooting'),0)::int AS new_root

      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      GROUP BY s.species_name
      ORDER BY s.species_name;
      `,
      params
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="production_summary_by_phase.pdf"'
    );

    const doc = new PDFDocument({ margin: WORD_A4_MARGIN, size: 'A4' });
    doc.pipe(res);
    attachLogo(doc);

    // Title
    doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Production Summary (Multiplication vs Rooting)', { align: 'center' });
    doc.moveDown(0.4);

    if (month && year) {
      doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(`Period: ${month}/${year}`, { align: 'center' });
      doc.moveDown(0.8);
    } else {
      doc.moveDown(0.8);
    }
    doc.fillColor('black');

    // ---- Table settings
    const startX = doc.page.margins.left;
    let y = doc.y;

    const col = {
      species: 170,
      usedMul: 70,
      newMul: 80,
      usedRoot: 70,
      newRoot: 80
    };

    const rowH = 22;

    const drawHeader = () => {
      doc.fontSize(10).font(DOC_BODY_BOLD_FONT).fillColor(DOC_TITLE_COLOR);

      doc.rect(startX, y, col.species + col.usedMul + col.newMul + col.usedRoot + col.newRoot, rowH)
        .stroke();

      let x = startX;
      doc.text('Species', x + 6, y + 6, { width: col.species - 12 }); x += col.species;
      doc.text('Used (Mul)', x + 6, y + 6, { width: col.usedMul - 12, align: 'right' }); x += col.usedMul;
      doc.text('New (Mul)', x + 6, y + 6, { width: col.newMul - 12, align: 'right' }); x += col.newMul;
      doc.text('Used (Root)', x + 6, y + 6, { width: col.usedRoot - 12, align: 'right' }); x += col.usedRoot;
      doc.text('New (Root)', x + 6, y + 6, { width: col.newRoot - 12, align: 'right' });

      doc.font(DOC_BODY_FONT).fillColor('black');
      y += rowH;
    };

    const drawRow = (r, isTotal = false) => {
      // page break
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }

      if (isTotal) doc.font(DOC_BODY_BOLD_FONT);

      doc.rect(startX, y, col.species + col.usedMul + col.newMul + col.usedRoot + col.newRoot, rowH)
        .stroke();

      let x = startX;
      doc.fontSize(10);

      doc.text(r.species_name, x + 6, y + 6, { width: col.species - 12 }); x += col.species;
      doc.text(String(r.used_mul), x + 6, y + 6, { width: col.usedMul - 12, align: 'right' }); x += col.usedMul;
      doc.text(String(r.new_mul), x + 6, y + 6, { width: col.newMul - 12, align: 'right' }); x += col.newMul;
      doc.text(String(r.used_root), x + 6, y + 6, { width: col.usedRoot - 12, align: 'right' }); x += col.usedRoot;
      doc.text(String(r.new_root), x + 6, y + 6, { width: col.newRoot - 12, align: 'right' });

      if (isTotal) doc.font(DOC_BODY_FONT);

      y += rowH;
    };

    // Header row
    drawHeader();

    if (rows.length === 0) {
      doc.fontSize(12).text('No data found.', startX, y + 10);
      doc.end();
      return;
    }

    // Rows + totals
    let total = { used_mul: 0, new_mul: 0, used_root: 0, new_root: 0 };

    rows.forEach(r => {
      total.used_mul += r.used_mul;
      total.new_mul += r.new_mul;
      total.used_root += r.used_root;
      total.new_root += r.new_root;

      drawRow(r);
    });

    // Total row
    drawRow(
      {
        species_name: 'TOTAL',
        used_mul: total.used_mul,
        new_mul: total.new_mul,
        used_root: total.used_root,
        new_root: total.new_root
      },
      true
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
exports.dailyMatrixPdf = async (req, res) => {
  try {
    const labId = req.user.lab_id;
    // YYYY-MM-DD
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const todayLocal = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const date = req.query.date || todayLocal;

    // 1) نجيب أسماء الـ species (أعمدة)
    const speciesRes = await pool.query(`
      SELECT id, species_name
      FROM species
      WHERE lab_id = $1
      ORDER BY species_name
    `, [labId]);
    const species = speciesRes.rows; // [{id, species_name}, ...]

    // 2) نجيب أسماء الموظفين (صفوف)
    const empRes = await pool.query(`
      SELECT id, full_name
      FROM employees
      WHERE lab_id = $1
      ORDER BY full_name
    `, [labId]);
    const employees = empRes.rows;

    // 3) نجمع الإنتاج (new jars) لكل Employee × Species بهاليوم
    // إذا operations_date عندك timestamp، هالشرط مضمون
    const dataRes = await pool.query(
      `
      SELECT
        d.employee_id,
        i.species_id,
        COALESCE(SUM(d.number_new_jars),0)::int AS total_new
      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      WHERE d.operations_date::date = $1::date
        AND i.lab_id = $2
      GROUP BY d.employee_id, i.species_id
      `,
      [date, labId]
    );

    // نحولها لِ map للوصول السريع: key = employeeId_speciesId
    const valueMap = new Map();
    for (const r of dataRes.rows) {
      valueMap.set(`${r.employee_id}_${r.species_id}`, r.total_new);
    }

    // PDF setup
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="daily_matrix_${date}.pdf"`);

    const doc = new PDFDocument({
      margin: WORD_A4_MARGIN,
      size: 'A4',
      layout: 'landscape' // مهم لجدول كبير
    });
    doc.pipe(res);
    attachLogo(doc);

    // Title
    doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Daily Production Matrix', { align: 'center' });
    doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(`Date: ${date}`, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1);

    // ---- Table sizing
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

    const headerH = 18;
    const rowH = 18;

    // أول عمود للموظف، والباقي للـ species
    const employeeColW = Math.max(140, pageWidth * 0.22);
    const remaining = pageWidth - employeeColW;
    const colW = species.length > 0 ? remaining / species.length : remaining;

    const ensureSpace = (h) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + h > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        return true;
      }
      return false;
    };

    const drawHeader = (y) => {
      // background
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageWidth, headerH).fill();
      doc.restore();

      // border
      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageWidth, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(6.5).fillColor(DOC_TITLE_COLOR);

      // Employee header cell
      doc.text('Employee', startX + 6, y + 5, { width: employeeColW - 10 });
      doc.moveTo(startX + employeeColW, y).lineTo(startX + employeeColW, y + headerH).stroke();

      // species headers
      let x = startX + employeeColW;
      for (const sp of species) {
        doc.text(sp.species_name, x + 4, y + 5, { width: colW - 9, align: 'center', ellipsis: true });
        x += colW;
        // vertical line
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }

      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
    };

    const drawRow = (y, emp, zebra) => {
      if (zebra) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageWidth, rowH).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageWidth, rowH).stroke();

      doc.fontSize(9.5).font(DOC_BODY_FONT);

      // Employee cell (لون أزرق مثل ما طلبت سابقًا)
      doc.fillColor('#1565C0');
      doc.text(emp.full_name, startX + 6, y + 5, { width: employeeColW - 10, ellipsis: true });
      doc.fillColor('black');

      // vertical line after employee col
      doc.moveTo(startX + employeeColW, y).lineTo(startX + employeeColW, y + rowH).stroke();

      // Values
      let x = startX + employeeColW;
      for (const sp of species) {
        const v = valueMap.get(`${emp.id}_${sp.id}`) ?? 0; // ✅ إذا ما اشتغل = 0
        doc.text(String(v), x + 4, y + 5, { width: colW - 8, align: 'center' });
        x += colW;
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      }
    };

    // Draw table
    let y = doc.y;
    if (ensureSpace(headerH)) y = doc.y;
    drawHeader(y);
    y += headerH;
    doc.y = y;

    employees.forEach((emp, idx) => {
      if (ensureSpace(rowH)) {
        y = doc.y;
        drawHeader(y);       // ✅ كرر header بكل صفحة
        y += headerH;
        doc.y = y;
      }

      drawRow(y, emp, idx % 2 === 1);
      y += rowH;
      doc.y = y;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
exports.operationsPdf = async (req, res) => {
  try {
    const { month, employee_id, species_id, phase } = req.query;
    const labId = req.user.lab_id;

    // -------- filters SQL
    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    // month = YYYY-MM
    if (month) {
      params.push(month);
      where += ` AND to_char(d.operations_date::date, 'YYYY-MM') = $${params.length}`;
    }
    if (employee_id) {
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

    // -------- resolve names for filters (to show in PDF)
    let employeeName = null;
    let speciesName = null;

    if (employee_id) {
      const r = await pool.query(
        `SELECT full_name FROM employees WHERE id = $1 AND lab_id = $2`,
        [Number(employee_id), labId]
      );
      employeeName = r.rows[0]?.full_name || `#${employee_id}`;
    }
    if (species_id) {
      const r = await pool.query(
        `SELECT species_name FROM species WHERE id = $1 AND lab_id = $2`,
        [Number(species_id), labId]
      );
      speciesName = r.rows[0]?.species_name || `#${species_id}`;
    }

    // -------- query rows (Details)
    const detailsRes = await pool.query(
      `
      SELECT
        d.id,
        d.operations_date,
        d.phase_of_culture,
        d.used_mother_jars,
        d.number_new_jars,
        d.subculture_new_jar,
        e.full_name,
        s.species_name,
        i.subculture_mother_jars
      FROM daily_operations d
      JOIN employees e ON e.id = d.employee_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY d.operations_date DESC, d.id DESC
      `,
      params
    );

    const rows = detailsRes.rows;

    // -------- summary
    const sumRes = await pool.query(
      `
      SELECT
        COUNT(*)::int AS operations_count,
        COALESCE(SUM(d.used_mother_jars),0)::int AS total_used,
        COALESCE(SUM(d.number_new_jars),0)::int AS total_new
      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      `,
      params
    );

    const summary = sumRes.rows[0] || { operations_count: 0, total_used: 0, total_new: 0 };

    // -------- PDF init
    const doc = setupPdf(res, 'operations_filtered.pdf');

    // Title
    doc.font(DOC_TITLE_FONT).fontSize(18).fillColor(DOC_TITLE_COLOR).text('In vitro Production Program', { align: 'center' });
    doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text('Operations Report', { align: 'center' });
    doc.moveDown(0.6);

    // Filters line
    const filtersText = [
      month ? `Month: ${month}` : null,
      employee_id ? `Employee: ${employeeName}` : null,
      species_id ? `Species: ${speciesName}` : null,
      phase ? `Phase: ${phase}` : null,
    ].filter(Boolean).join('  |  ') || 'No filters';

    doc.font(DOC_BODY_FONT).fontSize(10).fillColor(DOC_SUBTITLE_COLOR).text(filtersText, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1);

    // Summary block (مثل production-by-species)
    doc.font(DOC_BODY_BOLD_FONT).fontSize(13).fillColor(DOC_TITLE_COLOR).text('Summary', { underline: true });
    doc.moveDown(0.4);

    doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(
      `Operations: ${summary.operations_count}   |   Total Used: ${summary.total_used}   |   Total New: ${summary.total_new}`
    );
    doc.fillColor('black');

    doc.moveDown(0.8);

    // If no rows
    if (rows.length === 0) {
      doc.moveDown(1);
      doc.font(DOC_BODY_FONT).fontSize(11).fillColor(DOC_SUBTITLE_COLOR).text('No operations found for these filters.', { align: 'center' });
      doc.end();
      return;
    }

    // -------- Details Table
    doc.moveDown(0.2);
    doc.font(DOC_BODY_BOLD_FONT).fontSize(13).fillColor(DOC_TITLE_COLOR).text('Details', { underline: true });
    doc.moveDown(0.5);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

	    const headerH = 22;
	    const rowH = 22;
	    const paddingX = 6;
	    const paddingY = 5;

    // ✅ Columns widths (tweak if needed)
	    const cols = [
	      pageW * 0.06, // ID
	      pageW * 0.11, // Date
	      pageW * 0.10, // Phase
	      pageW * 0.18, // Employee
	      pageW * 0.21, // Species (bigger)
	      pageW * 0.10, // Mother Sub
	      pageW * 0.08, // Used
	      pageW * 0.08, // New
	      pageW * 0.08  // New Sub
	    ];
	    // Fix float rounding so columns end exactly at pageW
	    const colsSum = cols.reduce((a, b) => a + b, 0);
	    cols[cols.length - 1] += (pageW - colsSum);

    const headers = ['ID', 'Date', 'Phase', 'Employee', 'Species', 'Mother Sub', 'Used', 'New', 'New Sub'];

    const bottomY = () => doc.page.height - doc.page.margins.bottom;

    const ensureSpace = (needed) => {
      if (doc.y + needed > bottomY()) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        return true;
      }
      return false;
    };

	    const drawHeader = (y) => {
	      // header background
	      doc.save();
	      doc.fillColor(DOC_HEADER_FILL);
	      doc.rect(startX, y, pageW, headerH).fill();
	      doc.restore();
	
	      doc.lineWidth(0.5);
	      doc.strokeColor(DOC_BORDER_COLOR);
	      doc.font(DOC_BODY_BOLD_FONT).fontSize(9.5).fillColor(DOC_TITLE_COLOR);
	
	      let x = startX;
	      for (let i = 0; i < headers.length; i++) {
	        doc.rect(x, y, cols[i], headerH).stroke();
	        doc.text(headers[i], x + paddingX, y + 6, {
	          width: cols[i] - paddingX * 2,
	          align: 'center',
	          ellipsis: true
	        });
	        x += cols[i];
	      }
	
	      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
	    };

	    const drawRow = (y, values, zebra) => {
	      const h = rowH;
	
	      if (zebra) {
	        doc.save();
	        doc.fillColor(DOC_ZEBRA_FILL);
	        doc.rect(startX, y, pageW, h).fill();
	        doc.restore();
	      }
	
	      doc.lineWidth(0.5);
	      doc.strokeColor(DOC_BORDER_COLOR);
	      let x = startX;
	      for (let i = 0; i < values.length; i++) {
	        doc.rect(x, y, cols[i], h).stroke();
	
	        const align =
	          i === 0 ? 'right' :
	          i === 1 ? 'center' :
	          i === 5 ? 'right' :
	          i === 6 ? 'right' :
	          i === 7 ? 'right' :
	          i === 8 ? 'right' :
	          'left';
	
	        if (i === 3) doc.fillColor('#1565C0').font(DOC_BODY_BOLD_FONT).fontSize(9.5);
	        else doc.fillColor('black').font(DOC_BODY_FONT).fontSize(9.5);
	
	        doc.text(String(values[i] ?? ''), x + paddingX, y + paddingY, {
	          width: cols[i] - paddingX * 2,
	          height: Math.max(0, h - paddingY * 2),
	          align,
	          ellipsis: true
	        });
	
	        x += cols[i];
	      }
	
	      doc.fillColor('black').font(DOC_BODY_FONT).strokeColor('black');
	      return h;
	    };

    // Draw first header
    drawHeader(doc.y);
    doc.y += headerH;

    rows.forEach((r, idx) => {
      const values = [
        r.id,
        String(r.operations_date).slice(0, 10),
        r.phase_of_culture || '-',
        r.full_name || '-',
        r.species_name || '-',
        r.subculture_mother_jars ?? '-',
        r.used_mother_jars ?? 0,
        r.number_new_jars ?? 0,
        r.subculture_new_jar ?? '-'
      ];

      if (ensureSpace(rowH + 2)) {
        drawHeader(doc.y);
        doc.y += headerH;
      }

      const h = drawRow(doc.y, values, idx % 2 === 1);
      doc.y += h;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
exports.inventoryOpsDetailGroupedPdf = async (req, res) => {
  try {
    const { month, date, employee_id, species_id, phase, include_rooting } = req.query;
    const labId = req.user.lab_id;

    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    if (date) {
      params.push(date);
      where += ` AND d.operations_date::date = $${params.length}::date`;
    }

    if (month) {
      params.push(month); // YYYY-MM
      where += ` AND to_char(d.operations_date::date, 'YYYY-MM') = $${params.length}`;
    }

    if (employee_id) {
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

    if (include_rooting === 'false') {
      where += ` AND (d.phase_of_culture IS NULL OR d.phase_of_culture NOT IN ('Rooting','Acclimatization'))`;
    }

    const details = await pool.query(
      `
      SELECT
        s.id AS species_id,
        s.species_name,
        i.id AS inventory_id,
        i.subculture_mother_jars,
        d.id AS operation_id,
        d.operations_date,
        d.phase_of_culture,
        e.full_name,
        d.used_mother_jars,
        d.number_new_jars,
        d.subculture_new_jar
      FROM daily_operations d
      JOIN employees e ON e.id = d.employee_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY s.species_name, i.subculture_mother_jars, i.id, d.operations_date DESC, d.id DESC
      `,
      params
    );

    const rows = details.rows;

    const doc = setupPdf(res, 'inventory_ops_detail_grouped.pdf');

    doc.font(DOC_TITLE_FONT).fontSize(18).fillColor(DOC_TITLE_COLOR).text('Inventory Operations Detail', { align: 'center' });
    doc.moveDown(0.3);

    const filtersText = [
      date ? `Date: ${date}` : null,
      month ? `Month: ${month}` : null,
      employee_id ? `Employee ID: ${employee_id}` : null,
      species_id ? `Species ID: ${species_id}` : null,
      phase ? `Phase: ${phase}` : null,
      include_rooting === 'false' ? 'Rooting excluded' : 'Rooting produced = 0'
    ].filter(Boolean).join(' | ') || 'No filters';

    doc.font(DOC_BODY_FONT).fontSize(10).fillColor(DOC_SUBTITLE_COLOR).text(filtersText, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.font(DOC_BODY_FONT).fontSize(11).fillColor(DOC_SUBTITLE_COLOR).text('No operations found for these filters.', { align: 'center' });
      doc.end();
      return;
    }

    // ======================
    // Table helpers
    // ======================
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    const headerH = 20;
    const paddingX = 6;
    const paddingY = 5;

    const ensureSpace = (needed) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + needed > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        return true;
      }
      return false;
    };

    const cols = [
      pageW * 0.07, // Op ID
      pageW * 0.12, // Date
      pageW * 0.14, // Phase
      pageW * 0.25, // Employee
      pageW * 0.12, // Used
      pageW * 0.12, // Produced
      pageW * 0.18  // New Sub
    ];
    const headers = ['Op ID', 'Date', 'Phase', 'Employee', 'Used', 'Produced', 'New Sub'];

    const drawHeader = (y) => {
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageW, headerH).fill();
      doc.restore();

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(9.5).fillColor(DOC_TITLE_COLOR);

      let x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + paddingX, y + 6, {
          width: cols[i] - paddingX * 2,
          align: (i >= 4) ? 'right' : 'left',
          ellipsis: true
        });
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }

      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
    };

    const cellHeight = (text, width, align = 'left') => {
      doc.font(DOC_BODY_FONT).fontSize(9.5);
      return doc.heightOfString(String(text ?? ''), { width, align });
    };

    const rowHeightFor = (values) => {
      let maxH = 0;
      for (let i = 0; i < values.length; i++) {
        const w = cols[i] - paddingX * 2;
        const h = cellHeight(values[i], w, i >= 4 ? 'right' : 'left');
        if (h > maxH) maxH = h;
      }
      return Math.max(18, maxH + paddingY * 2);
    };

    const drawRow = (y, values, zebra) => {
      const h = rowHeightFor(values);

      if (zebra) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageW, h).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, h).stroke();

      // vertical lines
      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
      }

      // text
      x = startX;
      for (let i = 0; i < values.length; i++) {
        const w = cols[i] - paddingX * 2;

        if (i === 3) doc.fillColor('#1565C0').font(DOC_BODY_BOLD_FONT).fontSize(9.5);
        else doc.fillColor('black').font(DOC_BODY_FONT).fontSize(9.5);

        doc.text(String(values[i] ?? ''), x + paddingX, y + paddingY, {
          width: w,
          align: (i >= 4) ? 'right' : 'left'
        });

        x += cols[i];
      }

      doc.fillColor('black').font(DOC_BODY_FONT).strokeColor('black');
      return h;
    };

    // ======================
    // Grouped rendering
    // ======================
    let currentSpecies = null;
    let currentInventory = null;

    let speciesTotalUsed = 0;
    let speciesTotalProduced = 0;

    let invTotalUsed = 0;
    let invTotalProduced = 0;

    let zebra = 0;

    const flushInventoryTotals = () => {
      if (!currentInventory) return;

      ensureSpace(30);

      doc.x = startX; // ✅ مهم
      doc.moveDown(0.2);

      doc.font(DOC_BODY_BOLD_FONT).fontSize(10.5).fillColor(DOC_TITLE_COLOR).text(
        `Inventory Totals (ID ${currentInventory}):  Used = ${invTotalUsed}  |  Produced = ${invTotalProduced}`,
        { width: pageW, align: 'left' } // ✅ Left
      );

  doc.font(DOC_BODY_FONT).fontSize(9.5).fillColor('black');
  doc.moveDown(0.4);
};


    const flushSpeciesTotals = () => {
      if (!currentSpecies) return;
      ensureSpace(30);
      doc.x = startX; // ✅ مهم
      doc.moveDown(0.2);
      doc.font(DOC_BODY_BOLD_FONT).fontSize(11).fillColor(DOC_TITLE_COLOR).text(
        `Species Totals (${currentSpecies}):  Used = ${speciesTotalUsed}  |  Produced = ${speciesTotalProduced}`,
        { width: pageW, align: 'left' } // ✅ Left
      );
      doc.font(DOC_BODY_FONT).fontSize(9.5).fillColor('black');
      doc.moveDown(0.6);
    };

    for (const r of rows) {
      const produced = (r.phase_of_culture === 'Rooting' || r.phase_of_culture === 'Acclimatization') ? 0 : (Number(r.number_new_jars) || 0);
      const used = Number(r.used_mother_jars) || 0;

      // ---- Species change
      if (currentSpecies !== r.species_name) {
        // close previous inventory + species
        if (currentSpecies !== null) {
          flushInventoryTotals();
          flushSpeciesTotals();
          doc.addPage();
        }

        currentSpecies = r.species_name;
        currentInventory = null;

        speciesTotalUsed = 0;
        speciesTotalProduced = 0;

        doc.font(DOC_BODY_BOLD_FONT).fontSize(15).fillColor(DOC_TITLE_COLOR).text(`Species: ${currentSpecies}`, { underline: true });
        doc.moveDown(0.6);
      }

      // ---- Inventory change inside same species
      const invKey = String(r.inventory_id);
      if (currentInventory !== invKey) {
        // close previous inventory totals
        if (currentInventory !== null) {
          flushInventoryTotals();
        }

        currentInventory = invKey;
        zebra = 0;

        invTotalUsed = 0;
        invTotalProduced = 0;

        ensureSpace(80);

        doc.x = startX; // ✅ مهم
        doc.font(DOC_BODY_BOLD_FONT).fontSize(12).fillColor(DOC_TITLE_COLOR).text(
          `Inventory #${r.inventory_id}  |  Mother Subculture: ${r.subculture_mother_jars}`,
          { width: pageW, align: 'left' } // ✅ Left ثابت
        );

        doc.moveDown(0.3);

        drawHeader(doc.y);
        doc.y += headerH;
      }

      // ---- Row values
      const values = [
        r.operation_id,
        String(r.operations_date).slice(0, 10),
        r.phase_of_culture || '-',
        r.full_name || '-',
        used,
        produced,
        (r.phase_of_culture === 'Rooting' || r.phase_of_culture === 'Acclimatization') ? '-' : (r.subculture_new_jar ?? '-')
      ];

      const neededH = rowHeightFor(values);
      if (ensureSpace(neededH + 2)) {
        drawHeader(doc.y);
        doc.y += headerH;
      }

      const h = drawRow(doc.y, values, zebra % 2 === 1);
      doc.y += h;
      zebra++;

      // ---- Totals
      invTotalUsed += used;
      invTotalProduced += produced;

      speciesTotalUsed += used;
      speciesTotalProduced += produced;
    }

    // close last inventory + species totals
    flushInventoryTotals();
    flushSpeciesTotals();

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
exports.contaminationFilteredPdf = async (req, res) => {
  try {
    const { month, employee_id, species_id } = req.query;
    const labId = req.user.lab_id;

    // ---- resolve names for filter header
    let employeeName = null;
    let speciesName = null;

    if (employee_id) {
      const r = await pool.query(
        `SELECT full_name FROM employees WHERE id=$1 AND lab_id = $2`,
        [Number(employee_id), labId]
      );
      employeeName = r.rows[0]?.full_name || `#${employee_id}`;
    }
    if (species_id) {
      const r = await pool.query(
        `SELECT species_name FROM species WHERE id=$1 AND lab_id = $2`,
        [Number(species_id), labId]
      );
      speciesName = r.rows[0]?.species_name || `#${species_id}`;
    }

    // ---- Filters
    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    // month format: YYYY-MM (فلترة على detected_date)
    if (month) {
      params.push(month);
      where += ` AND to_char(d.operations_date::date, 'YYYY-MM') = $${params.length}`;
    }
    if (employee_id) {
      params.push(Number(employee_id));
      where += ` AND c.employee_id = $${params.length}`;
    }
    if (species_id) {
      params.push(Number(species_id));
      where += ` AND s.id = $${params.length}`;
    }

    // ---- Data
    const { rows } = await pool.query(
      `
      SELECT
        to_char(d.operations_date::date, 'YYYY-MM-DD') AS culture_date,
        e.full_name,
        s.species_name,
        d.subculture_new_jar,
        d.number_new_jars AS produced_jars,
        c.contaminated_jars,
        c.contamination_type,
        c.notes
      FROM contamination_records c
      JOIN employees e ON e.id = c.employee_id
      JOIN daily_operations d ON d.id = c.operation_id
      JOIN inventory i ON i.id = d.inventory_id
      JOIN species s ON s.id = i.species_id
      ${where}
      ORDER BY d.operations_date DESC, c.id DESC
      `,
      params
    );

    // ---- PDF
    const doc = setupPdf(res, 'contamination_filtered.pdf');

    doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Contamination Report', { align: 'center' });
    doc.moveDown(0.4);

    const filtersText = [
      month ? `Month: ${month}` : null,
      employee_id ? `Employee: ${employeeName}` : null,
      species_id ? `Species: ${speciesName}` : null
    ].filter(Boolean).join(' | ') || 'No filters';

    doc.font(DOC_BODY_FONT).fontSize(10).fillColor(DOC_SUBTITLE_COLOR).text(filtersText, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(0.8);

    // ---- Table layout
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

    const headerH = 20;
    const paddingX = 6;
    const paddingY = 5;

    const cols = [
      pageW * 0.12, // culture date
      pageW * 0.16, // employee
      pageW * 0.10, // species
      pageW * 0.10, // subculture
      pageW * 0.09, // produced
      pageW * 0.11, // contaminated
      pageW * 0.16, // type
      pageW * 0.16  // notes
    ];

    const headers = ['Culture Date', 'Employee', 'Species', 'Subculture', 'Produced', 'Contaminated', 'Type', 'Notes'];

    const bottomY = () => doc.page.height - doc.page.margins.bottom;

    const ensureSpace = (needed) => {
      if (doc.y + needed > bottomY()) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        return true;
      }
      return false;
    };

    const drawHeader = (y) => {
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageW, headerH).fill();
      doc.restore();

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(9.5).fillColor(DOC_TITLE_COLOR);

      let x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + paddingX, y + 6, {
          width: cols[i] - paddingX * 2,
          align: 'left',
          ellipsis: true
        });
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }
      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
    };

    const rowHeightFor = () => 18;

    const drawRow = (y, values, zebra) => {
      const h = rowHeightFor(values);

      if (zebra) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageW, h).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, h).stroke();

      // vertical lines
      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
      }

      // text
      x = startX;
      for (let i = 0; i < values.length; i++) {
        const w = cols[i] - paddingX * 2;

        doc.fillColor('black').font(DOC_BODY_FONT).fontSize(9.5);

        doc.text(String(values[i] ?? ''), x + paddingX, y + paddingY, {
          width: w,
          height: Math.max(0, h - paddingY * 2),
          align: 'left',
          lineBreak: false,
          ellipsis: true
        });

        x += cols[i];
      }

      doc.fillColor('black').font(DOC_BODY_FONT).strokeColor('black');
      return h;
    };

    if (rows.length === 0) {
      doc.font(DOC_BODY_FONT).fontSize(11).fillColor(DOC_SUBTITLE_COLOR).text('No contamination records found for these filters.', { align: 'center' });
      doc.end();
      return;
    }

    drawHeader(doc.y);
    doc.y += headerH;

    rows.forEach((r, idx) => {
      const values = [
        r.culture_date || '-',
        r.full_name || '-',
        r.species_name || '-',
        r.subculture_new_jar ?? '-',
        r.produced_jars ?? 0,
        r.contaminated_jars ?? 0,
        r.contamination_type || '-',
        r.notes || ''
      ];

      const neededH = rowHeightFor(values);
      if (ensureSpace(neededH + 2)) {
        drawHeader(doc.y);
        doc.y += headerH;
      }

      const h = drawRow(doc.y, values, idx % 2 === 1);
      doc.y += h;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
function normalizeDateParam(raw) {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');

  const todayISO = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  if (raw == null || raw === '') return todayISO;

  // ✅ force string + cleanup (important)
  let s = String(raw).trim();
  try { s = decodeURIComponent(s); } catch (_) {}
  s = s.replace(/\+/g, ' ').trim();

  // ✅ already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ✅ handle: "Mon Feb 02" or "Mon Feb 02 2026"
  // allow extra spaces
  const m = s.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/);
  if (m) {
    const mon = m[1].toLowerCase();
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : now.getFullYear();

    const monthMap = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };

    const month = monthMap[mon];
    if (month && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // ✅ fallback: try Date.parse
  // if string is like "Mon Feb 02" without year, add current year
  const try1 = new Date(s);
  if (!Number.isNaN(try1.getTime())) {
    return `${try1.getFullYear()}-${pad2(try1.getMonth() + 1)}-${pad2(try1.getDate())}`;
  }

  const try2 = new Date(`${s} ${now.getFullYear()}`);
  if (!Number.isNaN(try2.getTime())) {
    return `${try2.getFullYear()}-${pad2(try2.getMonth() + 1)}-${pad2(try2.getDate())}`;
  }

  return null;
}
exports.weeklyMatrixPdf = async (req, res) => {
  try {
    const labId = req.user.lab_id;

    const rawDate = normalizeDateParam(req.query.date);

    if (!rawDate) {
      return res.status(400).json({
        error: `Invalid date value. Use YYYY-MM-DD. Received: "${req.query.date}"`
      });
    }


    // ✅ Postgres يحدد Monday و Friday
     const week = await pool.query(
      `
      SELECT
        to_char(date_trunc('week', $1::date)::date, 'YYYY-MM-DD') AS monday,
        to_char((date_trunc('week', $1::date)::date + 4), 'YYYY-MM-DD') AS friday
      `,
      [rawDate]
    );

    const monStr = String(week.rows[0].monday).slice(0, 10);
    const friStr = String(week.rows[0].friday).slice(0, 10);

    // ✅ Days list Mon..Fri من Postgres
    const daysRes = await pool.query(
      `
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day
      FROM generate_series($1::date, $2::date, interval '1 day') d
      ORDER BY day
      `,
      [monStr, friStr]
    );
    const days = daysRes.rows.map(r => r.day);

    // species
    const speciesRes = await pool.query(`
      SELECT id, species_name
      FROM species
      WHERE lab_id = $1
      ORDER BY species_name
    `, [labId]);
    const species = speciesRes.rows;

    // employees
    const empRes = await pool.query(`
      SELECT id, full_name
      FROM employees
      WHERE lab_id = $1
      ORDER BY full_name
    `, [labId]);
    const employees = empRes.rows;

    // ✅ data for week in one query
    const dataRes = await pool.query(
      `
      SELECT
        d.employee_id,
        i.species_id,
        to_char(d.operations_date::date, 'YYYY-MM-DD') AS op_date,
        COALESCE(SUM(d.number_new_jars),0)::int AS total_new
      FROM daily_operations d
      JOIN inventory i ON i.id = d.inventory_id
      WHERE d.operations_date::date BETWEEN $1::date AND $2::date
        AND i.lab_id = $3
      GROUP BY d.employee_id, i.species_id, to_char(d.operations_date::date, 'YYYY-MM-DD')
      `,
      [monStr, friStr, labId]
    );

    // Map: key = employee_species_date
    const valueMap = new Map();
    for (const r of dataRes.rows) {
      valueMap.set(`${r.employee_id}_${r.species_id}_${r.op_date}`, r.total_new);
    }

    // PDF setup
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="weekly_matrix_${monStr}_to_${friStr}.pdf"`);

    const doc = new PDFDocument({ margin: WORD_A4_MARGIN, size: 'A4', layout: 'landscape' });
    doc.pipe(res);
    attachLogo(doc);

    // sizing
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    const headerH = 18;
    const rowH = 18;

    const employeeColW = Math.max(140, pageWidth * 0.22);
    const remaining = pageWidth - employeeColW;
    const colW = species.length > 0 ? remaining / species.length : remaining;

    const ensureSpace = (h) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + h > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        return true;
      }
      return false;
    };

    const drawHeader = (y) => {
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageWidth, headerH).fill();
      doc.restore();

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageWidth, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(6.5).fillColor(DOC_TITLE_COLOR);

      doc.text('Employee', startX + 6, y + 5, { width: employeeColW - 10 });
      doc.moveTo(startX + employeeColW, y).lineTo(startX + employeeColW, y + headerH).stroke();

      let x = startX + employeeColW;
      for (const sp of species) {
        doc.text(sp.species_name, x + 4, y + 5, { width: colW - 9, align: 'center', ellipsis: true });
        x += colW;
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }
      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
    };

    const drawRow = (y, emp, zebra, dayStr) => {
      if (zebra) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageWidth, rowH).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageWidth, rowH).stroke();

      doc.fontSize(9.5).font(DOC_BODY_FONT);

      doc.fillColor('#1565C0');
      doc.text(emp.full_name, startX + 6, y + 5, { width: employeeColW - 10, ellipsis: true });
      doc.fillColor('black');

      doc.moveTo(startX + employeeColW, y).lineTo(startX + employeeColW, y + rowH).stroke();

      let x = startX + employeeColW;
      for (const sp of species) {
        const v = valueMap.get(`${emp.id}_${sp.id}_${dayStr}`) ?? 0;
        doc.text(String(v), x + 4, y + 5, { width: colW - 8, align: 'center' });
        x += colW;
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      }
    };

    // one page per day
    days.forEach((dayStr, dayIndex) => {
      if (dayIndex > 0) doc.addPage();

      doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Weekly Production Matrix (Mon-Fri)', { align: 'center' });
      doc.font(DOC_BODY_FONT).fontSize(10.5).fillColor(DOC_SUBTITLE_COLOR).text(`Week: ${monStr} to ${friStr}`, { align: 'center' });
      doc.font(DOC_BODY_BOLD_FONT).fontSize(12).fillColor(DOC_TITLE_COLOR).text(`Day: ${dayStr}`, { align: 'center' });
      doc.fillColor('black');
      doc.moveDown(1);

      let y = doc.y;
      if (ensureSpace(headerH)) y = doc.y;
      drawHeader(y);
      y += headerH;
      doc.y = y;

      employees.forEach((emp, idx) => {
        if (ensureSpace(rowH)) {
          y = doc.y;
          drawHeader(y);
          y += headerH;
          doc.y = y;
        }
        drawRow(y, emp, idx % 2 === 1, dayStr);
        y += rowH;
        doc.y = y;
      });
    });

    doc.end();
  } catch (err) {
  console.error('WEEKLY MATRIX ERROR:', err);

  return res.status(500).json({
    error: err.message,
    stack: err.stack
  });
}

};
exports.inventoryAdjustmentsPdf = async (req, res) => {
  try {
    const { date, employee_id, species_id, type } = req.query;
    const labId = req.user.lab_id;

    const params = [labId];
    let where = 'WHERE i.lab_id = $1';

    if (date) { params.push(date); where += ` AND a.adjustment_date = $${params.length}::date`; }
    if (employee_id) { params.push(Number(employee_id)); where += ` AND a.employee_id = $${params.length}`; }
    if (species_id) { params.push(Number(species_id)); where += ` AND s.id = $${params.length}`; }
    if (type) { params.push(type); where += ` AND a.type = $${params.length}`; }

    const doc = setupPdf(res, 'inventory_adjustments.pdf');
    doc.font(DOC_TITLE_FONT).fontSize(16).fillColor(DOC_TITLE_COLOR).text('Inventory Adjustments Report', { align: 'center' });
    doc.moveDown(0.6);

    const { rows } = await pool.query(
      `
      SELECT
        a.id,
        to_char(a.adjustment_date, 'YYYY-MM-DD') AS adjustment_date,
        a.type,
        a.qty,
        a.notes,
        e.full_name,
        s.species_name,
        i.subculture_mother_jars,
        a.inventory_id
      FROM inventory_adjustments a
      JOIN inventory i ON i.id = a.inventory_id
      JOIN species s ON s.id = i.species_id
      LEFT JOIN employees e ON e.id = a.employee_id
      ${where}
      ORDER BY a.adjustment_date DESC, a.id DESC
      `,
      params
    );

    if (rows.length === 0) {
      doc.font(DOC_BODY_FONT).fontSize(11).fillColor(DOC_SUBTITLE_COLOR).text('No adjustments found.', { align: 'center' });
      doc.end();
      return;
    }

    // جدول بسيط منظم (زي inventoryPdf)
    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    const headerH = 20;
    const rowH = 18;

    const cols = [
      pageW * 0.06, // ID
      pageW * 0.12, // Date
      pageW * 0.14, // Type
      pageW * 0.18, // Employee
      pageW * 0.10, // Species
      pageW * 0.10, // Sub
      pageW * 0.08, // Qty
      pageW * 0.22  // Notes
    ];

    const headers = ['ID', 'Date', 'Type', 'Employee', 'Species', 'Sub', 'Qty', 'Notes'];

    const bottomY = () => doc.page.height - doc.page.margins.bottom;
	    const ensureSpace = (needed) => {
	      if (doc.y + needed > bottomY()) {
	        doc.addPage();
	        return true;
	      }
	      return false;
	};


    const drawHeader = (y) => {
      doc.save();
      doc.fillColor(DOC_HEADER_FILL);
      doc.rect(startX, y, pageW, headerH).fill();
      doc.restore();

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, headerH).stroke();

      doc.font(DOC_BODY_BOLD_FONT).fontSize(9.5).fillColor(DOC_TITLE_COLOR);

      let x = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 4, y + 6, { width: cols[i] - 8, ellipsis: true });
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      }

	      doc.font(DOC_BODY_FONT).fillColor('black').strokeColor('black');
		};

    const drawRow = (y, r, zebra) => {
      if (zebra) {
        doc.save();
        doc.fillColor(DOC_ZEBRA_FILL);
        doc.rect(startX, y, pageW, rowH).fill();
        doc.restore();
      }

      doc.lineWidth(0.5);
      doc.strokeColor(DOC_BORDER_COLOR);
      doc.rect(startX, y, pageW, rowH).stroke();

      const values = [
        r.id,
        r.adjustment_date,
        r.type,
        r.full_name || '-',
        r.species_name,
        r.subculture_mother_jars,
        r.qty,
        r.notes || ''
      ];

      let x = startX;
      for (let i = 0; i < values.length; i++) {
        if (i === 3) doc.fillColor('#1565C0'); else doc.fillColor(DOC_TITLE_COLOR);
        doc.text(String(values[i]), x + 4, y + 5, { width: cols[i] - 8, ellipsis: true });
        x += cols[i];
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      }
      doc.fillColor('black').strokeColor('black');
    };

    // Render
    let y = doc.y;
    drawHeader(y);
    doc.y += headerH;

    rows.forEach((r, idx) => {
      if (ensureSpace(rowH)) {
        doc.y = doc.page.margins.top;
        drawHeader(doc.y);
        doc.y += headerH;
      }
      drawRow(doc.y, r, idx % 2 === 1);
      doc.y += rowH;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};

