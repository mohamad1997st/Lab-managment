const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { APP_ORIGIN } = require('./config/email.config');
const billingController = require('./controllers/billing.controller');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || '').toLowerCase() === 'true';

if (NODE_ENV === 'production') {
  // Render/Vercel proxies terminate TLS before forwarding to Node.
  app.set('trust proxy', 1);
}

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
    if (!origin || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
