const Stripe = require('stripe');
const {
  STRIPE_PRICE_IDS,
  STRIPE_SECRET_KEY
} = require('../config/billing.config');

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const isStripeConfigured = () => Boolean(stripe);

const getStripePriceIdForPlan = (planCode) => STRIPE_PRICE_IDS[String(planCode || '').trim().toLowerCase()] || '';
const getPlanCodeForStripePriceId = (priceId) => {
  const normalized = String(priceId || '').trim();
  if (!normalized) return '';
  return Object.entries(STRIPE_PRICE_IDS).find(([, configuredPriceId]) => configuredPriceId === normalized)?.[0] || '';
};

module.exports = {
  getPlanCodeForStripePriceId,
  getStripePriceIdForPlan,
  isStripeConfigured,
  stripe
};
