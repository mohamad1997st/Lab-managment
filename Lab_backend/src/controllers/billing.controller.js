const pool = require('../config/db');
const {
  STRIPE_CHECKOUT_CANCEL_URL,
  STRIPE_CHECKOUT_SUCCESS_URL,
  STRIPE_PORTAL_RETURN_URL,
  STRIPE_WEBHOOK_SECRET
} = require('../config/billing.config');
const {
  getPlanCodeForStripePriceId,
  getStripePriceIdForPlan,
  isStripeConfigured,
  stripe
} = require('../services/stripe.service');

const normalizeText = (value) => String(value || '').trim();

const mapStripeStatus = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'active';
  }
};

const resolvePlanCode = ({ metadataPlanCode, priceId, fallback = 'starter' }) => {
  const normalizedMetadataPlan = normalizeText(metadataPlanCode).toLowerCase();
  if (normalizedMetadataPlan) return normalizedMetadataPlan;
  return getPlanCodeForStripePriceId(priceId) || fallback;
};

const getLabById = async (labId) => {
  const { rows } = await pool.query(
    `SELECT id, name, email, stripe_customer_id, stripe_subscription_id
     FROM labs
     WHERE id = $1`,
    [labId]
  );
  return rows[0] || null;
};

const ensureStripeConfigured = (res) => {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Stripe is not configured yet on the backend.' });
    return false;
  }
  return true;
};

const ensureStripeCustomer = async (lab) => {
  if (lab.stripe_customer_id) return lab.stripe_customer_id;

  const customer = await stripe.customers.create({
    name: lab.name,
    email: lab.email || undefined,
    metadata: {
      lab_id: String(lab.id)
    }
  });

  await pool.query(
    `UPDATE labs
     SET stripe_customer_id = $1
     WHERE id = $2`,
    [customer.id, lab.id]
  );

  return customer.id;
};

const upsertBillingHistoryFromInvoice = async (invoice, status) => {
  const labId = Number.parseInt(invoice.metadata?.lab_id || invoice.parent?.subscription_details?.metadata?.lab_id || '', 10);
  if (!Number.isFinite(labId)) return;

  const amountCents = Number.isFinite(invoice.amount_paid) ? invoice.amount_paid : invoice.amount_due;
  const currency = String(invoice.currency || 'usd').toUpperCase();
  const priceId = invoice.lines?.data?.[0]?.pricing?.price_details?.price || invoice.lines?.data?.[0]?.price?.id || '';
  const planCode = resolvePlanCode({
    metadataPlanCode: invoice.metadata?.plan_code || invoice.parent?.subscription_details?.metadata?.plan_code,
    priceId
  });
  const planLabel = normalizeText(invoice.metadata?.plan_label) || planCode;
  const periodStartUnix = invoice.lines?.data?.[0]?.period?.start;
  const periodEndUnix = invoice.lines?.data?.[0]?.period?.end;

  await pool.query(
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
     VALUES ($1, 'invoice', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      labId,
      planCode,
      planLabel,
      amountCents ?? null,
      currency,
      status,
      periodStartUnix ? new Date(periodStartUnix * 1000).toISOString() : null,
      periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      priceId ? `Stripe price ${priceId}` : 'Stripe invoice webhook sync'
    ]
  );
};

const syncLabFromStripeSubscription = async (subscription) => {
  const labId = Number.parseInt(subscription.metadata?.lab_id || '', 10);
  if (!Number.isFinite(labId)) return;

  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const currentPeriodStart = subscription.items?.data?.[0]?.current_period_start || subscription.current_period_start || null;
  const currentPeriodEnd = subscription.items?.data?.[0]?.current_period_end || subscription.current_period_end || null;
  const trialEnd = subscription.trial_end || null;
  const planCode = resolvePlanCode({
    metadataPlanCode: subscription.metadata?.plan_code,
    priceId,
    fallback: 'starter'
  });

  await pool.query(
    `UPDATE labs
     SET stripe_customer_id = COALESCE($1, stripe_customer_id),
         stripe_subscription_id = $2,
         stripe_price_id = $3,
         subscription_plan = $4,
         subscription_status = $5,
         subscription_starts_at = $6,
         subscription_ends_at = $7,
         trial_ends_at = $8
     WHERE id = $9`,
    [
      subscription.customer || null,
      subscription.id || null,
      priceId,
      planCode,
      mapStripeStatus(subscription.status),
      currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
      currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      labId
    ]
  );
};

exports.getBillingConfig = async (_req, res) => {
  res.json({
    provider: 'stripe',
    configured: isStripeConfigured()
  });
};

exports.createCheckoutSession = async (req, res) => {
  if (!ensureStripeConfigured(res)) return;

  const planCode = normalizeText(req.body?.plan_code).toLowerCase();
  const planLabel = normalizeText(req.body?.plan_label) || planCode;
  const priceId = getStripePriceIdForPlan(planCode);
  if (!priceId) {
    return res.status(400).json({ error: 'Stripe price is not configured for that plan.' });
  }

  const lab = await getLabById(req.user.lab_id);
  if (!lab) {
    return res.status(404).json({ error: 'Lab not found' });
  }

  const customerId = await ensureStripeCustomer(lab);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    success_url: STRIPE_CHECKOUT_SUCCESS_URL,
    cancel_url: STRIPE_CHECKOUT_CANCEL_URL,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      lab_id: String(lab.id),
      plan_code: planCode,
      plan_label: planLabel
    },
    subscription_data: {
      metadata: {
        lab_id: String(lab.id),
        plan_code: planCode,
        plan_label: planLabel
      }
    }
  });

  res.json({ url: session.url });
};

exports.createPortalSession = async (req, res) => {
  if (!ensureStripeConfigured(res)) return;

  const lab = await getLabById(req.user.lab_id);
  if (!lab) {
    return res.status(404).json({ error: 'Lab not found' });
  }
  if (!lab.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer exists for this lab yet.' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: lab.stripe_customer_id,
    return_url: STRIPE_PORTAL_RETURN_URL
  });

  res.json({ url: session.url });
};

exports.handleStripeWebhook = async (req, res) => {
  if (!ensureStripeConfigured(res)) return;
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe webhook secret is not configured yet.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const labId = Number.parseInt(session.metadata?.lab_id || '', 10);
      if (Number.isFinite(labId)) {
        await pool.query(
          `UPDATE labs
           SET stripe_customer_id = COALESCE($1, stripe_customer_id),
               stripe_subscription_id = COALESCE($2, stripe_subscription_id)
           WHERE id = $3`,
          [
            session.customer || null,
            session.subscription || null,
            labId
          ]
        );
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await syncLabFromStripeSubscription(event.data.object);
    }

    if (event.type === 'invoice.paid') {
      await upsertBillingHistoryFromInvoice(event.data.object, 'paid');
    }

    if (event.type === 'invoice.payment_failed') {
      await upsertBillingHistoryFromInvoice(event.data.object, 'issued');
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.__testables = {
  mapStripeStatus,
  resolvePlanCode
};
