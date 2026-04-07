const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
const EMAIL_FROM = (process.env.EMAIL_FROM || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
const APP_ORIGIN = (process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')[0]
  .trim();

const resendConfigured =
  EMAIL_PROVIDER === 'resend' &&
  Boolean(EMAIL_FROM) &&
  Boolean(RESEND_API_KEY);

const gmailConfigured =
  EMAIL_PROVIDER === 'gmail' &&
  Boolean(EMAIL_FROM) &&
  Boolean(SMTP_HOST) &&
  Number.isFinite(SMTP_PORT) &&
  Boolean(SMTP_USER) &&
  Boolean(SMTP_PASS);

module.exports = {
  EMAIL_PROVIDER,
  EMAIL_FROM,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  APP_ORIGIN,
  resendConfigured,
  gmailConfigured,
  emailConfigured: resendConfigured || gmailConfigured
};
