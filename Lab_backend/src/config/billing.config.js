const { APP_ORIGIN } = require('./email.config');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || '',
  growth: process.env.STRIPE_GROWTH_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || ''
};

const STRIPE_CHECKOUT_SUCCESS_URL = process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${APP_ORIGIN}/subscription?billing=success`;
const STRIPE_CHECKOUT_CANCEL_URL = process.env.STRIPE_CHECKOUT_CANCEL_URL || `${APP_ORIGIN}/subscription?billing=cancelled`;
const STRIPE_PORTAL_RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL || `${APP_ORIGIN}/subscription`;

module.exports = {
  STRIPE_CHECKOUT_CANCEL_URL,
  STRIPE_CHECKOUT_SUCCESS_URL,
  STRIPE_PORTAL_RETURN_URL,
  STRIPE_PRICE_IDS,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET
};
