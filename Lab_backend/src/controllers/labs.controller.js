const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const {
  getEffectiveSubscription,
  getLabUsageById,
  normalizeDateTime,
  normalizeInteger,
  normalizePlan,
  normalizeStatus
} = require('../services/subscription.service');

const normalizeText = (value) => String(value || '').trim();
const BILLING_EVENT_TYPES = new Set(['renewal', 'upgrade', 'invoice']);
const BILLING_STATUSES = new Set(['issued', 'paid', 'void']);
const DEFAULT_CURRENCY = 'USD';
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const LAB_LOGO_PATH = path.join(__dirname, '..', 'assets', 'LOGO-1.jpg');
const LAB_LOGO_UPLOAD_DIR = path.join(__dirname, '..', 'assets', 'lab-logos');
const ALLOWED_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const WORD_A4_MARGIN = 72;

const normalizeCurrency = (value) => {
  const currency = String(value || DEFAULT_CURRENCY).trim().toUpperCase();
  return currency || DEFAULT_CURRENCY;
};

const sameDateTime = (left, right) => {
  const normalizedLeft = left ? new Date(left).toISOString() : null;
  const normalizedRight = right ? new Date(right).toISOString() : null;
  return normalizedLeft === normalizedRight;
};

const hasStripeManagedSubscriptionChange = ({ currentLab, nextSubscription }) => (
  nextSubscription.subscription_plan !== normalizePlan(currentLab.subscription_plan) ||
  nextSubscription.subscription_status !== normalizeStatus(currentLab.subscription_status) ||
  !sameDateTime(nextSubscription.subscription_starts_at, currentLab.subscription_starts_at) ||
  !sameDateTime(nextSubscription.subscription_ends_at, currentLab.subscription_ends_at) ||
  !sameDateTime(nextSubscription.trial_ends_at, currentLab.trial_ends_at)
);

const formatMoney = (amountCents, currency = DEFAULT_CURRENCY) => (
  amountCents === null || amountCents === undefined
    ? 'Custom pricing'
    : `${(amountCents / 100).toFixed(2)} ${currency}`
);

const formatDateLabel = (value) => (
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '-'
);

const getInitials = (value) => String(value || '')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || 'MR';

const buildLogoUrl = (logoPath) => (logoPath ? '/api/labs/me/logo' : '');
const isPdfSafeImagePath = (candidatePath) => ['.png', '.jpg', '.jpeg'].includes(path.extname(String(candidatePath || '')).toLowerCase());

const resolveExistingLogoPath = (candidatePath) => {
  const normalized = String(candidatePath || '').trim();
  if (!normalized) return '';

  const resolved = path.resolve(BACKEND_ROOT, normalized);
  if (!resolved.startsWith(BACKEND_ROOT)) return '';
  if (!fs.existsSync(resolved)) return '';
  return resolved;
};

const sanitizeLogoFilename = (filename) => {
  const ext = path.extname(String(filename || '')).toLowerCase();
  const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
  return safeExt;
};

const ensureLogoUploadDir = () => {
  fs.mkdirSync(LAB_LOGO_UPLOAD_DIR, { recursive: true });
};

const relativeLogoPath = (absolutePath) => path.relative(BACKEND_ROOT, absolutePath).replace(/\\/g, '/');

const drawMetaRow = (doc, label, value, x, y, width) => {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#0f172a')
    .text(label, x, y, { width: 110 });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#334155')
    .text(value, x + 115, y, { width: width - 115 });
};

const drawInfoCard = (doc, { x, y, width, title, lines, accent = '#166534' }) => {
  const height = 96;
  doc
    .roundedRect(x, y, width, height, 16)
    .fillAndStroke('#f8fafc', '#dbe4ee');
  doc
    .roundedRect(x, y, 8, height, 16)
    .fill(accent);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0f172a')
    .text(title, x + 20, y + 16, { width: width - 32 });

  let currentY = y + 40;
  lines.forEach((line) => {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(line, x + 20, currentY, { width: width - 32 });
    currentY += 16;
  });
};

const renderInvoicePdf = (res, record) => {
  const doc = new PDFDocument({ size: 'A4', margin: WORD_A4_MARGIN });
  const amount = formatMoney(record.amount_cents, record.currency);
  const statusColor = record.status === 'paid' ? '#166534' : record.status === 'void' ? '#9f1239' : '#b45309';
  const brandColor = '#166534';
  const accentColor = '#0f766e';
  const softBrand = '#ecfdf5';
  const initials = getInitials(record.lab_name);
  const configuredLogoPath = resolveExistingLogoPath(record.lab_logo_path);
  const safeConfiguredLogoPath = isPdfSafeImagePath(configuredLogoPath) ? configuredLogoPath : '';
  const fallbackLogoPath = fs.existsSync(LAB_LOGO_PATH) && isPdfSafeImagePath(LAB_LOGO_PATH) ? LAB_LOGO_PATH : '';
  const logoPath = safeConfiguredLogoPath || fallbackLogoPath;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${record.id}.pdf"`);
  doc.pipe(res);

  doc
    .rect(0, 0, doc.page.width, 198)
    .fill('#f8fafc');
  doc
    .rect(0, 0, doc.page.width, 12)
    .fill(brandColor);
  doc
    .circle(doc.page.width - 90, 72, 56)
    .fill('#dcfce7');
  doc
    .circle(doc.page.width - 56, 112, 34)
    .fill('#bbf7d0');
  doc
    .roundedRect(48, 40, 72, 72, 24)
    .fill('#ffffff');
  doc
    .roundedRect(48, 40, 72, 72, 24)
    .lineWidth(1.2)
    .stroke('#bbf7d0');

  if (logoPath) {
    doc.image(logoPath, 54, 46, {
      fit: [60, 60],
      align: 'center',
      valign: 'center'
    });
  } else {
    doc
      .roundedRect(48, 40, 72, 72, 24)
      .fill(brandColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor('#ffffff')
      .text(initials, 48, 62, { width: 72, align: 'center' });
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor('#14532d')
    .text(record.lab_name || 'Mother Roots', 138, 46);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#334155')
    .text('Billing invoice', 138, 78);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#475569')
    .text(record.lab_email || 'No billing email on file', 138, 96);

  doc
    .roundedRect(48, 132, 180, 34, 17)
    .fill(statusColor);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#ffffff')
    .text(record.status.toUpperCase(), 48, 142, { width: 180, align: 'center' });

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0f172a')
    .text(amount, doc.page.width - 220, 54, { width: 172, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#475569')
    .text(`Invoice #${record.id}`, doc.page.width - 220, 74, { width: 172, align: 'right' });
  doc
    .text(`Issued ${formatDateLabel(record.created_at)}`, doc.page.width - 220, 90, { width: 172, align: 'right' });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const halfWidth = (pageWidth - 16) / 2;
  const topCardsY = 222;

  drawInfoCard(doc, {
    x: 48,
    y: topCardsY,
    width: halfWidth,
    title: 'Invoice Summary',
    accent: brandColor,
    lines: [
      `Invoice ID: #${record.id}`,
      `Event: ${record.event_type}`,
      `Created: ${formatDateLabel(record.created_at)}`
    ]
  });

  drawInfoCard(doc, {
    x: 48 + halfWidth + 16,
    y: topCardsY,
    width: halfWidth,
    title: 'Amount Due',
    accent: accentColor,
    lines: [
      amount,
      `Plan: ${record.plan_label}`,
      `Cycle: ${formatDateLabel(record.period_starts_at)} - ${formatDateLabel(record.period_ends_at)}`
    ]
  });

  const sectionY = topCardsY + 130;
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#0f172a')
    .text('Billing Details', 48, sectionY);

  doc
    .roundedRect(48, sectionY + 18, pageWidth, 188, 18)
    .fillAndStroke('#ffffff', '#dbe4ee');

  const leftX = 68;
  let rowY = sectionY + 40;
  drawMetaRow(doc, 'Lab name', record.lab_name || '-', leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Lab email', record.lab_email || '-', leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Phone', record.lab_phone || '-', leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Plan code', record.plan_code || '-', leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Period start', formatDateLabel(record.period_starts_at), leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Period end', formatDateLabel(record.period_ends_at), leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Address', record.lab_address || '-', leftX, rowY, pageWidth - 40);
  rowY += 22;
  drawMetaRow(doc, 'Notes', record.notes || 'No extra notes for this invoice.', leftX, rowY, pageWidth - 40);

  const footerY = sectionY + 260;
  doc
    .roundedRect(48, footerY, pageWidth, 70, 18)
    .fillAndStroke(softBrand, '#bbf7d0');
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(brandColor)
    .text('Thank you for building with Mother Roots.', 68, footerY + 18);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(brandColor)
    .text('This invoice was generated automatically from the billing history module and styled with your lab identity.', 68, footerY + 38, {
      width: pageWidth - 40
    });

  doc.end();
};

exports.getCurrentLab = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       id,
       name,
       email,
       phone,
       address,
       logo_path,
       subscription_plan,
       subscription_status,
       subscription_starts_at,
       subscription_ends_at,
       trial_ends_at,
       stripe_subscription_id,
       max_users,
       max_employees,
       max_species
     FROM labs
     WHERE id = $1`,
    [req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Lab not found' });
  }

  const lab = rows[0];
  const usage = await getLabUsageById(req.user.lab_id);
  res.json({
    id: lab.id,
    name: lab.name,
    email: lab.email,
    phone: lab.phone,
    address: lab.address,
    logo_path: lab.logo_path,
    logo_url: buildLogoUrl(lab.logo_path),
    subscription: {
      ...getEffectiveSubscription(lab),
      usage
    }
  });
};

exports.updateCurrentLab = async (req, res) => {
  const name = normalizeText(req.body?.name);
  const email = normalizeText(req.body?.email);
  const phone = normalizeText(req.body?.phone);
  const address = normalizeText(req.body?.address);
  const logo_path = String(req.body?.logo_path || '').trim();

  if (!name) {
    return res.status(400).json({ error: 'Lab name is required' });
  }

  const duplicate = await pool.query(
    'SELECT id FROM labs WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1',
    [name, req.user.lab_id]
  );
  if (duplicate.rowCount > 0) {
    return res.status(409).json({ error: 'Lab name already exists' });
  }

  const { rows } = await pool.query(
    `UPDATE labs
     SET name = $1, email = $2, phone = $3, address = $4, logo_path = $5
     WHERE id = $6
     RETURNING
       id,
       name,
       email,
       phone,
       address,
       logo_path,
       subscription_plan,
       subscription_status,
       subscription_starts_at,
       subscription_ends_at,
       trial_ends_at,
       stripe_subscription_id,
       max_users,
       max_employees,
       max_species`,
    [name, email || null, phone || null, address || null, logo_path || null, req.user.lab_id]
  );

  const lab = rows[0];
  const usage = await getLabUsageById(req.user.lab_id);
  res.json({
    id: lab.id,
    name: lab.name,
    email: lab.email,
    phone: lab.phone,
    address: lab.address,
    logo_path: lab.logo_path,
    logo_url: buildLogoUrl(lab.logo_path),
    subscription: {
      ...getEffectiveSubscription(lab),
      usage
    }
  });
};

exports.getCurrentLabLogo = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT logo_path FROM labs WHERE id = $1',
    [req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Lab not found' });
  }

  const resolvedLogoPath = resolveExistingLogoPath(rows[0].logo_path) || (fs.existsSync(LAB_LOGO_PATH) ? LAB_LOGO_PATH : '');
  if (!resolvedLogoPath) {
    return res.status(404).json({ error: 'Lab logo not found' });
  }

  return res.sendFile(resolvedLogoPath);
};

exports.uploadCurrentLabLogo = async (req, res) => {
  const filename = String(req.body?.filename || '').trim();
  const mimeType = String(req.body?.mime_type || '').trim().toLowerCase();
  const contentBase64 = String(req.body?.content_base64 || '').trim();

  if (!filename || !mimeType || !contentBase64) {
    return res.status(400).json({ error: 'filename, mime_type, and content_base64 are required' });
  }
  if (!ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'Only PNG, JPG, JPEG, and WEBP logos are supported' });
  }

  let fileBuffer;
  try {
    fileBuffer = Buffer.from(contentBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Logo payload is not valid base64' });
  }

  if (!fileBuffer.length || fileBuffer.length > MAX_LOGO_BYTES) {
    return res.status(400).json({ error: 'Logo file must be between 1 byte and 2 MB' });
  }

  ensureLogoUploadDir();
  const ext = sanitizeLogoFilename(filename);
  const savedFilename = `lab-${req.user.lab_id}-${Date.now()}${ext}`;
  const absoluteLogoPath = path.join(LAB_LOGO_UPLOAD_DIR, savedFilename);
  const nextLogoPath = relativeLogoPath(absoluteLogoPath);

  fs.writeFileSync(absoluteLogoPath, fileBuffer);

  const { rows } = await pool.query(
    `UPDATE labs
     SET logo_path = $1
     WHERE id = $2
     RETURNING logo_path`,
    [nextLogoPath, req.user.lab_id]
  );

  return res.status(201).json({
    logo_path: rows[0]?.logo_path || nextLogoPath,
    logo_url: buildLogoUrl(rows[0]?.logo_path || nextLogoPath)
  });
};

exports.updateCurrentLabSubscription = async (req, res) => {
  const existingRes = await pool.query(
    `SELECT
       id,
       subscription_plan,
       subscription_status,
       subscription_starts_at,
       subscription_ends_at,
       trial_ends_at,
       stripe_subscription_id,
       max_users,
       max_employees,
       max_species
     FROM labs
     WHERE id = $1`,
    [req.user.lab_id]
  );

  if (existingRes.rows.length === 0) {
    return res.status(404).json({ error: 'Lab not found' });
  }

  const currentLab = existingRes.rows[0];
  const subscription_plan = normalizePlan(req.body?.subscription_plan);
  const subscription_status = normalizeStatus(req.body?.subscription_status);
  const subscription_starts_at = normalizeDateTime(req.body?.subscription_starts_at);
  const subscription_ends_at = normalizeDateTime(req.body?.subscription_ends_at);
  const trial_ends_at = normalizeDateTime(req.body?.trial_ends_at);
  const max_users = normalizeInteger(req.body?.max_users);
  const max_employees = normalizeInteger(req.body?.max_employees);
  const max_species = normalizeInteger(req.body?.max_species);
  const isStripeManaged = Boolean(currentLab.stripe_subscription_id);

  if (isStripeManaged) {
    const triedToChangeStripeManagedFields = hasStripeManagedSubscriptionChange({
      currentLab,
      nextSubscription: {
        subscription_plan,
        subscription_status,
        subscription_starts_at,
        subscription_ends_at,
        trial_ends_at
      }
    });

    if (triedToChangeStripeManagedFields) {
      return res.status(409).json({
        error: 'This lab is managed by Stripe. Change plan, renewal, or cancellation in Stripe, then use this page only for quota overrides.'
      });
    }
  }

  const { rows } = await pool.query(
    `UPDATE labs
     SET subscription_plan = $1,
         subscription_status = $2,
         subscription_starts_at = $3,
         subscription_ends_at = $4,
         trial_ends_at = $5,
         max_users = $6,
         max_employees = $7,
         max_species = $8
     WHERE id = $9
     RETURNING
       id,
       subscription_plan,
       subscription_status,
       subscription_starts_at,
       subscription_ends_at,
       trial_ends_at,
       stripe_subscription_id,
       max_users,
       max_employees,
       max_species`,
    [
      isStripeManaged ? currentLab.subscription_plan : subscription_plan,
      isStripeManaged ? currentLab.subscription_status : subscription_status,
      isStripeManaged ? currentLab.subscription_starts_at : subscription_starts_at,
      isStripeManaged ? currentLab.subscription_ends_at : subscription_ends_at,
      isStripeManaged ? currentLab.trial_ends_at : trial_ends_at,
      max_users,
      max_employees,
      max_species,
      req.user.lab_id
    ]
  );

  const usage = await getLabUsageById(req.user.lab_id);
  res.json({
    subscription: {
      ...getEffectiveSubscription(rows[0]),
      usage
    }
  });
};

exports.getBillingHistory = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       id,
       event_type,
       plan_code,
       plan_label,
       amount_cents,
       currency,
       status,
       period_starts_at,
       period_ends_at,
       notes,
       created_at
     FROM lab_billing_history
     WHERE lab_id = $1
     ORDER BY created_at DESC, id DESC`,
    [req.user.lab_id]
  );

  res.json(rows);
};

exports.createBillingRecord = async (req, res) => {
  const event_type = normalizeText(req.body?.event_type).toLowerCase();
  const plan_code = normalizeText(req.body?.plan_code).toLowerCase();
  const plan_label = normalizeText(req.body?.plan_label);
  const amount_cents = normalizeInteger(req.body?.amount_cents);
  const currency = normalizeCurrency(req.body?.currency);
  const status = normalizeText(req.body?.status || 'issued').toLowerCase();
  const period_starts_at = normalizeDateTime(req.body?.period_starts_at);
  const period_ends_at = normalizeDateTime(req.body?.period_ends_at);
  const notes = normalizeText(req.body?.notes);

  if (!BILLING_EVENT_TYPES.has(event_type)) {
    return res.status(400).json({ error: 'Invalid billing event type' });
  }
  if (!plan_code || !plan_label) {
    return res.status(400).json({ error: 'plan_code and plan_label are required' });
  }
  if (!BILLING_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid billing status' });
  }

  const { rows } = await pool.query(
    `INSERT INTO lab_billing_history (
       lab_id,
       event_type,
       plan_code,
       plan_label,
       amount_cents,
       currency,
       status,
       period_starts_at,
       period_ends_at,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING
       id,
       event_type,
       plan_code,
       plan_label,
       amount_cents,
       currency,
       status,
       period_starts_at,
       period_ends_at,
       notes,
       created_at`,
    [
      req.user.lab_id,
      event_type,
      plan_code,
      plan_label,
      amount_cents,
      currency,
      status,
      period_starts_at,
      period_ends_at,
      notes || null
    ]
  );

  res.status(201).json(rows[0]);
};

exports.updateBillingRecordStatus = async (req, res) => {
  const billingId = Number.parseInt(req.params.id, 10);
  const status = normalizeText(req.body?.status).toLowerCase();
  const notes = normalizeText(req.body?.notes);

  if (!Number.isFinite(billingId)) {
    return res.status(400).json({ error: 'Invalid billing record id' });
  }
  if (!BILLING_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid billing status' });
  }

  const { rows } = await pool.query(
    `UPDATE lab_billing_history
     SET status = $1,
         notes = COALESCE(NULLIF($2, ''), notes)
     WHERE id = $3
       AND lab_id = $4
     RETURNING
       id,
       event_type,
       plan_code,
       plan_label,
       amount_cents,
       currency,
       status,
       period_starts_at,
       period_ends_at,
       notes,
       created_at`,
    [status, notes, billingId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Billing record not found' });
  }

  res.json(rows[0]);
};

exports.downloadBillingInvoice = async (req, res) => {
  const billingId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(billingId)) {
    return res.status(400).json({ error: 'Invalid billing record id' });
  }

  const { rows } = await pool.query(
    `SELECT
       b.id,
       b.event_type,
       b.plan_code,
       b.plan_label,
       b.amount_cents,
       b.currency,
       b.status,
       b.period_starts_at,
       b.period_ends_at,
       b.notes,
       b.created_at,
       l.name AS lab_name,
       l.email AS lab_email,
       l.phone AS lab_phone,
       l.address AS lab_address,
       l.logo_path AS lab_logo_path
     FROM lab_billing_history b
     JOIN labs l ON l.id = b.lab_id
     WHERE b.id = $1
       AND b.lab_id = $2`,
    [billingId, req.user.lab_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Billing record not found' });
  }

  const record = rows[0];
  renderInvoicePdf(res, record);
};

exports.__testables = {
  hasStripeManagedSubscriptionChange,
  sameDateTime
};
