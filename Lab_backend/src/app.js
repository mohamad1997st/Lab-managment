const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { APP_ORIGIN } = require('./config/email.config');
const billingController = require('./controllers/billing.controller');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || '').toLowerCase() === 'true';
const ALLOW_VERCEL_PREVIEWS = String(process.env.ALLOW_VERCEL_PREVIEWS || '').toLowerCase() === 'true';

if (NODE_ENV === 'production') {
  // Render/Vercel proxies terminate TLS before forwarding to Node.
  app.set('trust proxy', 1);
}

const rawCorsOrigins = [process.env.CORS_ORIGIN, process.env.APP_ORIGIN]
  .filter(Boolean)
  .join(',');

const corsOrigins = (rawCorsOrigins || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function normalizeOrigin(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch (err) {
    return trimmed.replace(/\/+$/, '');
  }
}

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    const hostname = (url.hostname || '').toLowerCase();
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
    );
  } catch (err) {
    return false;
  }
}

const allowedCorsOrigins = new Set(corsOrigins.map(normalizeOrigin).filter(Boolean));

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedCorsOrigins.has(normalized)) return true;
  if (NODE_ENV !== 'production' && isLocalDevOrigin(normalized)) return true;
  if (ALLOW_VERCEL_PREVIEWS && /^https:\/\/[-a-z0-9]+\.vercel\.app$/i.test(normalized)) return true;
  return false;
}

app.use(cookieParser());

app.use((req, res, next) => {
  const isSecureRequest = req.secure || req.get('x-forwarded-proto') === 'https';

  if (NODE_ENV === 'production' && FORCE_HTTPS && !isSecureRequest) {
    const host = req.get('host');
    if (host) {
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    }
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (NODE_ENV === 'production' && isSecureRequest) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Health endpoint for platforms like Render (useful for quick diagnostics)
app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'lab_backend',
    env: NODE_ENV
  });
});

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingController.handleStripeWebhook);

app.use(express.json());

app.get('/invite/:token', (req, res) => {
  const token = encodeURIComponent(String(req.params.token || ''));
  return res.redirect(`${APP_ORIGIN}/invite/${token}`);
});

app.get('/reset-password/:token', (req, res) => {
  const token = encodeURIComponent(String(req.params.token || ''));
  return res.redirect(`${APP_ORIGIN}/reset-password/${token}`);
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/billing', require('./routes/billing.routes'));
app.use('/api/invites', require('./routes/invites.routes'));
app.use('/api/labs', require('./routes/labs.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/employees', require('./routes/employees.routes'));
app.use('/api/species', require('./routes/species.routes'));
app.use('/api/inventory', require('./routes/inventory.routes'));
app.use('/api/daily-operations', require('./routes/dailyOperations.routes'));
app.use('/api/contamination', require('./routes/contamination.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/inventory-adjustments', require('./routes/inventoryAdjustments.routes'));
app.use('/api/newsletter', require('./routes/newsletter.routes'));

module.exports = app;
