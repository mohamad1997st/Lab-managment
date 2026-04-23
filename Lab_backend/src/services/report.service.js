const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'LOGO-1.jpg');
const LOGO_OFFSET_Y = 25;
const LOGO_FIT = [140, 70];
const WORD_A4_MARGIN = 72;
const WORD_BODY_FONT = 'Times-Roman';
const WORD_BODY_BOLD_FONT = 'Times-Bold';
const WORD_HEADING_FONT = 'Helvetica-Bold';

function drawLogo(doc) {
  try {
    if (!fs.existsSync(LOGO_PATH)) return;

    const prevX = doc.x;
    const prevY = doc.y;

    const x = doc.page.margins.left;
    const y = 5 + LOGO_OFFSET_Y;

    doc.image(LOGO_PATH, x, y, { fit: LOGO_FIT });

    doc.x = prevX;
    doc.y = prevY;
  } catch {
    // ignore logo errors to avoid breaking PDF generation
  }
}

function attachLogo(doc) {
  drawLogo(doc);
  return doc;
}

function newDoc(res, title) {
  const doc = new PDFDocument({ margin: WORD_A4_MARGIN, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${title.replace(/\s+/g, '_')}.pdf"`);

  doc.pipe(res);
  return attachLogo(doc);
}

function header(doc, title, subtitle = '') {
  doc
    .font(WORD_HEADING_FONT)
    .fontSize(16)
    .fillColor('#111827')
    .text(title, { align: 'center', lineGap: 2 });
  if (subtitle) {
    doc
      .moveDown(0.2)
      .font(WORD_BODY_FONT)
      .fontSize(10.5)
      .fillColor('#4B5563')
      .text(subtitle, { align: 'center', lineGap: 1 });
  }
  doc.fillColor('black');
  doc.moveDown(0.9);
}

function drawTable(doc, headers, rows, options = {}) {
  const startX = options.x ?? doc.x;
  let y = options.y ?? doc.y;
  const minRowH = options.rowH ?? 26;
  const paddingX = options.paddingX ?? 8;
  const paddingY = options.paddingY ?? 8;
  const fontSize = options.fontSize ?? 10.5;
  const headerFontSize = options.headerFontSize ?? 10;
  const borderColor = options.borderColor ?? 'black';
  const headerFill = options.headerFill ?? '#F3F4F6';
  const zebraFill = options.zebraFill ?? '#FAFAFA';
  const textColor = options.textColor ?? '#111827';
  const headerTextColor = options.headerTextColor ?? '#1F2937';
  const rowFill = options.rowFill;
  const pageUsableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = Array.isArray(options.colWidths)
    ? options.colWidths
    : Array(headers.length).fill(options.colW ?? Math.floor(pageUsableWidth / headers.length));
  const tableW = colWidths.reduce((sum, width) => sum + width, 0);
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const contentWidth = (width) => Math.max(0, width - (paddingX * 2));

  const isNumericLike = (value) => {
    if (typeof value === 'number') return true;
    if (typeof value !== 'string') return false;
    const normalized = value.replace(/[,#%\s]/g, '');
    return normalized !== '' && !Number.isNaN(Number(normalized));
  };

  const normalizeCell = (value, columnIndex, fallbackAlign = 'left') => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        text: String(value.text ?? ''),
        align: value.align || fallbackAlign,
        color: value.color || null,
        fill: value.fill || null
      };
    }

    return {
      text: String(value ?? ''),
      align: isNumericLike(value) ? 'right' : fallbackAlign,
      color: null,
      fill: null,
      columnIndex
    };
  };

  const getRowHeight = (cells, isHeader = false) => {
    const size = isHeader ? headerFontSize : fontSize;
    const heights = cells.map((cell, index) => {
      const fallbackAlign = isNumericLike(cell) ? 'right' : 'left';
      const normalized = normalizeCell(cell, index, fallbackAlign);
      return doc.heightOfString(normalized.text || ' ', {
        width: contentWidth(colWidths[index]),
        align: normalized.align
      });
    });

    return Math.max(minRowH, Math.ceil(Math.max(...heights, size) + (paddingY * 2)));
  };

  const drawCells = (cells, isHeader, rowHeight, rowIndex = 0) => {
    let fill = null;

    if (isHeader) {
      fill = headerFill;
    } else if (typeof rowFill === 'function') {
      fill = rowFill(cells, rowIndex) || (rowIndex % 2 === 1 ? zebraFill : null);
    } else if (typeof rowFill === 'string' && rowFill) {
      fill = rowFill;
    } else if (rowIndex % 2 === 1) {
      fill = zebraFill;
    }

    if (fill) {
      doc.save();
      doc.fillColor(fill);
      doc.rect(startX, y, tableW, rowHeight).fill();
      doc.restore();
    }

    let x = startX;
    doc.lineWidth(isHeader ? 0.8 : 0.5);
    doc.strokeColor(borderColor);
    doc.font(isHeader ? WORD_BODY_BOLD_FONT : WORD_BODY_FONT).fontSize(isHeader ? headerFontSize : fontSize);

    for (let i = 0; i < headers.length; i++) {
      const fallbackAlign = isHeader ? 'left' : (isNumericLike(cells[i]) ? 'right' : 'left');
      const cell = normalizeCell(cells[i], i, fallbackAlign);

      if (cell.fill && !isHeader) {
        doc.save();
        doc.fillColor(cell.fill);
        doc.rect(x, y, colWidths[i], rowHeight).fill();
        doc.restore();
      }

      doc.rect(x, y, colWidths[i], rowHeight).stroke();
      doc.fillColor(isHeader ? headerTextColor : (cell.color || textColor));
      doc.text(cell.text, x + paddingX, y + paddingY, {
        width: contentWidth(colWidths[i]),
        align: cell.align,
        lineGap: isHeader ? 1 : 2
      });

      x += colWidths[i];
    }

    doc.fillColor('black');
    doc.strokeColor('black');
  };

  const drawHeaderRow = () => {
    const headerHeight = getRowHeight(headers, true);
    if (y + headerHeight > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    drawCells(headers, true, headerHeight, 0);
    y += headerHeight;
  };

  const drawDataRow = (cells, rowIndex) => {
    const rowHeight = getRowHeight(cells, false);
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeaderRow();
    }
    drawCells(cells, false, rowHeight, rowIndex);
    y += rowHeight;
  };

  drawHeaderRow();

  if (!rows.length) {
    doc.moveDown(0.4);
    doc.font(WORD_BODY_FONT).fontSize(fontSize).fillColor('#6B7280').text('No rows to display.', startX, y + 6, {
      width: tableW,
      align: 'center'
    });
    doc.fillColor('black');
    doc.y = y + minRowH;
    return;
  }

  rows.forEach((row, index) => drawDataRow(row, index));

  doc.moveDown(0.8);
  doc.y = y;
}

module.exports = { newDoc, header, drawTable, attachLogo };
