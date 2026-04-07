const assert = require('node:assert/strict');

const {
  getEffectiveSubscription,
  normalizeDateTime,
  normalizeInteger,
  normalizePlan,
  normalizeStatus
} = require('../src/services/subscription.service');

const createMockRes = () => {
  const response = {
    statusCode: 200,
    body: undefined,
    sentFilePath: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    sendFile(filePath) {
      this.sentFilePath = filePath;
      return this;
    }
  };
  return response;
};

const loadBillingModule = ({ dbQueryImpl, stripeServiceMock, billingConfigMock } = {}) => {
  const billingPath = require.resolve('../src/controllers/billing.controller');
  const stripeServicePath = require.resolve('../src/services/stripe.service');
  const billingConfigPath = require.resolve('../src/config/billing.config');
  const dbPath = require.resolve('../src/config/db');

  delete require.cache[billingPath];
  if (dbQueryImpl) {
    const dbModule = require(dbPath);
    dbModule.query = dbQueryImpl;
  }
  if (stripeServiceMock) {
    require.cache[stripeServicePath] = {
      id: stripeServicePath,
      filename: stripeServicePath,
      loaded: true,
      exports: stripeServiceMock
    };
  } else {
    delete require.cache[stripeServicePath];
  }
  if (billingConfigMock) {
    require.cache[billingConfigPath] = {
      id: billingConfigPath,
      filename: billingConfigPath,
      loaded: true,
      exports: billingConfigMock
    };
  } else {
    delete require.cache[billingConfigPath];
  }

  return require('../src/controllers/billing.controller');
};

const loadLabsModule = ({ queryImpl } = {}) => {
  const labsPath = require.resolve('../src/controllers/labs.controller');
  const dbPath = require.resolve('../src/config/db');

  delete require.cache[labsPath];
  if (queryImpl) {
    const dbModule = require(dbPath);
    dbModule.query = queryImpl;
  }

  return require('../src/controllers/labs.controller');
};

const tests = [
  {
    name: 'normalize helpers return safe defaults',
    run() {
      assert.equal(normalizePlan('GROWTH'), 'growth');
      assert.equal(normalizePlan('unknown-plan'), 'trial');
      assert.equal(normalizeStatus('PAST_DUE'), 'past_due');
      assert.equal(normalizeStatus('not-real'), 'trialing');
      assert.equal(normalizeInteger('12'), 12);
      assert.equal(normalizeInteger(''), null);
      assert.equal(normalizeInteger('-1'), null);
      assert.equal(normalizeDateTime('2026-04-01T12:30:00Z'), '2026-04-01T12:30:00.000Z');
      assert.equal(normalizeDateTime('not-a-date'), null);
    }
  },
  {
    name: 'trial subscriptions expire after trial end',
    run() {
      const subscription = getEffectiveSubscription({
        subscription_plan: 'trial',
        subscription_status: 'trialing',
        trial_ends_at: '2000-01-01T00:00:00.000Z',
        stripe_subscription_id: null,
        max_users: 3,
        max_employees: 10,
        max_species: 20
      });

      assert.equal(subscription.status, 'expired');
      assert.equal(subscription.is_active, false);
      assert.equal(subscription.billing_provider, 'manual');
      assert.equal(subscription.is_stripe_managed, false);
    }
  },
  {
    name: 'active subscriptions expire after end date and mark stripe-managed labs',
    run() {
      const subscription = getEffectiveSubscription({
        subscription_plan: 'starter',
        subscription_status: 'active',
        subscription_ends_at: '2000-01-01T00:00:00.000Z',
        stripe_subscription_id: 'sub_123',
        max_users: 5,
        max_employees: 20,
        max_species: 30
      });

      assert.equal(subscription.status, 'expired');
      assert.equal(subscription.billing_provider, 'stripe');
      assert.equal(subscription.is_stripe_managed, true);
    }
  },
  {
    name: 'future active subscriptions stay active',
    run() {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const subscription = getEffectiveSubscription({
        subscription_plan: 'growth',
        subscription_status: 'active',
        subscription_starts_at: new Date().toISOString(),
        subscription_ends_at: futureDate,
        trial_ends_at: null,
        stripe_subscription_id: null,
        max_users: null,
        max_employees: null,
        max_species: null
      });

      assert.equal(subscription.status, 'active');
      assert.equal(subscription.is_active, true);
      assert.equal(subscription.max_users, null);
    }
  },
  {
    name: 'Stripe status mapping normalizes lifecycle states',
    run() {
      const { __testables } = loadBillingModule();

      assert.equal(__testables.mapStripeStatus('trialing'), 'trialing');
      assert.equal(__testables.mapStripeStatus('active'), 'active');
      assert.equal(__testables.mapStripeStatus('past_due'), 'past_due');
      assert.equal(__testables.mapStripeStatus('unpaid'), 'past_due');
      assert.equal(__testables.mapStripeStatus('incomplete'), 'past_due');
      assert.equal(__testables.mapStripeStatus('canceled'), 'canceled');
      assert.equal(__testables.mapStripeStatus('incomplete_expired'), 'expired');
      assert.equal(__testables.mapStripeStatus('anything-else'), 'active');
    }
  },
  {
    name: 'resolvePlanCode prefers metadata plan code',
    run() {
      const { __testables } = loadBillingModule();

      assert.equal(__testables.resolvePlanCode({
        metadataPlanCode: 'growth',
        priceId: 'price_unused',
        fallback: 'starter'
      }), 'growth');
    }
  },
  {
    name: 'resolvePlanCode falls back to configured Stripe price ids',
    run() {
      process.env.STRIPE_STARTER_PRICE_ID = 'price_starter_test';
      process.env.STRIPE_GROWTH_PRICE_ID = 'price_growth_test';
      process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_enterprise_test';

      const { __testables } = loadBillingModule();

      assert.equal(__testables.resolvePlanCode({
        metadataPlanCode: '',
        priceId: 'price_growth_test',
        fallback: 'starter'
      }), 'growth');

      assert.equal(__testables.resolvePlanCode({
        metadataPlanCode: '',
        priceId: 'price_missing',
        fallback: 'starter'
      }), 'starter');
    }
  },
  {
    name: 'Stripe-managed subscription rule detects plan/date changes',
    run() {
      const labsController = loadLabsModule();

      const changed = labsController.__testables.hasStripeManagedSubscriptionChange({
        currentLab: {
          subscription_plan: 'starter',
          subscription_status: 'active',
          subscription_starts_at: '2026-04-01T00:00:00.000Z',
          subscription_ends_at: '2026-05-01T00:00:00.000Z',
          trial_ends_at: null
        },
        nextSubscription: {
          subscription_plan: 'growth',
          subscription_status: 'active',
          subscription_starts_at: '2026-04-01T00:00:00.000Z',
          subscription_ends_at: '2026-06-01T00:00:00.000Z',
          trial_ends_at: null
        }
      });

      assert.equal(changed, true);
    }
  },
  {
    name: 'Stripe-managed subscription rule ignores quota-only changes',
    run() {
      const labsController = loadLabsModule();

      const changed = labsController.__testables.hasStripeManagedSubscriptionChange({
        currentLab: {
          subscription_plan: 'starter',
          subscription_status: 'active',
          subscription_starts_at: '2026-04-01T00:00:00.000Z',
          subscription_ends_at: '2026-05-01T00:00:00.000Z',
          trial_ends_at: null
        },
        nextSubscription: {
          subscription_plan: 'starter',
          subscription_status: 'active',
          subscription_starts_at: '2026-04-01T00:00:00.000Z',
          subscription_ends_at: '2026-05-01T00:00:00.000Z',
          trial_ends_at: null
        }
      });

      assert.equal(changed, false);
    }
  },
  {
    name: 'uploadCurrentLabLogo rejects unsupported mime types',
    async run() {
      const labsController = loadLabsModule({
        async query() {
          throw new Error('DB should not be queried for invalid mime type');
        }
      });

      const req = {
        user: { lab_id: 4 },
        body: {
          filename: 'logo.gif',
          mime_type: 'image/gif',
          content_base64: Buffer.from('demo').toString('base64')
        }
      };
      const res = createMockRes();

      await labsController.uploadCurrentLabLogo(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /Only PNG, JPG, JPEG, and WEBP logos are supported/i);
    }
  },
  {
    name: 'uploadCurrentLabLogo rejects oversized files',
    async run() {
      const labsController = loadLabsModule({
        async query() {
          throw new Error('DB should not be queried for oversized logo');
        }
      });

      const oversizedPayload = Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString('base64');
      const req = {
        user: { lab_id: 4 },
        body: {
          filename: 'logo.png',
          mime_type: 'image/png',
          content_base64: oversizedPayload
        }
      };
      const res = createMockRes();

      await labsController.uploadCurrentLabLogo(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /between 1 byte and 2 MB/i);
    }
  },
  {
    name: 'createCheckoutSession rejects plans without configured Stripe prices',
    async run() {
      const billingController = loadBillingModule({
        stripeServiceMock: {
          getPlanCodeForStripePriceId: () => '',
          getStripePriceIdForPlan: () => '',
          isStripeConfigured: () => true,
          stripe: {}
        },
        billingConfigMock: {
          STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:5173/subscription?billing=cancelled',
          STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:5173/subscription?billing=success',
          STRIPE_PORTAL_RETURN_URL: 'http://localhost:5173/subscription',
          STRIPE_WEBHOOK_SECRET: 'whsec_test'
        }
      });

      const req = {
        user: { lab_id: 1 },
        body: { plan_code: 'starter', plan_label: 'Starter' }
      };
      const res = createMockRes();

      await billingController.createCheckoutSession(req, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /price is not configured/i);
    }
  },
  {
    name: 'createCheckoutSession returns 404 when lab does not exist',
    async run() {
      const billingController = loadBillingModule({
        dbQueryImpl: async () => ({ rows: [] }),
        stripeServiceMock: {
          getPlanCodeForStripePriceId: () => '',
          getStripePriceIdForPlan: () => 'price_starter',
          isStripeConfigured: () => true,
          stripe: {}
        },
        billingConfigMock: {
          STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:5173/subscription?billing=cancelled',
          STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:5173/subscription?billing=success',
          STRIPE_PORTAL_RETURN_URL: 'http://localhost:5173/subscription',
          STRIPE_WEBHOOK_SECRET: 'whsec_test'
        }
      });

      const req = {
        user: { lab_id: 999 },
        body: { plan_code: 'starter', plan_label: 'Starter' }
      };
      const res = createMockRes();

      await billingController.createCheckoutSession(req, res);

      assert.equal(res.statusCode, 404);
      assert.match(res.body.error, /Lab not found/i);
    }
  },
  {
    name: 'handleStripeWebhook returns 503 when webhook secret is missing',
    async run() {
      const billingController = loadBillingModule({
        stripeServiceMock: {
          getPlanCodeForStripePriceId: () => '',
          getStripePriceIdForPlan: () => 'price_starter',
          isStripeConfigured: () => true,
          stripe: {
            webhooks: {
              constructEvent() {
                throw new Error('should not be called');
              }
            }
          }
        },
        billingConfigMock: {
          STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:5173/subscription?billing=cancelled',
          STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:5173/subscription?billing=success',
          STRIPE_PORTAL_RETURN_URL: 'http://localhost:5173/subscription',
          STRIPE_WEBHOOK_SECRET: ''
        }
      });

      const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig_test' } };
      const res = createMockRes();

      await billingController.handleStripeWebhook(req, res);

      assert.equal(res.statusCode, 503);
      assert.match(res.body.error, /webhook secret is not configured/i);
    }
  },
  {
    name: 'handleStripeWebhook records checkout completion updates',
    async run() {
      const queries = [];
      const billingController = loadBillingModule({
        dbQueryImpl: async (sql, params) => {
          queries.push({ sql, params });
          return { rows: [] };
        },
        stripeServiceMock: {
          getPlanCodeForStripePriceId: () => '',
          getStripePriceIdForPlan: () => 'price_starter',
          isStripeConfigured: () => true,
          stripe: {
            webhooks: {
              constructEvent() {
                return {
                  type: 'checkout.session.completed',
                  data: {
                    object: {
                      metadata: { lab_id: '4' },
                      customer: 'cus_123',
                      subscription: 'sub_123'
                    }
                  }
                };
              }
            }
          }
        },
        billingConfigMock: {
          STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:5173/subscription?billing=cancelled',
          STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:5173/subscription?billing=success',
          STRIPE_PORTAL_RETURN_URL: 'http://localhost:5173/subscription',
          STRIPE_WEBHOOK_SECRET: 'whsec_test'
        }
      });

      const req = { body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig_test' } };
      const res = createMockRes();

      await billingController.handleStripeWebhook(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { received: true });
      assert.equal(queries.some((entry) => entry.sql.includes('stripe_subscription_id = COALESCE($2, stripe_subscription_id)')), true);
    }
  }
];

(async () => {
  let failed = false;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${test.name}`);
      console.error(error.stack || error.message);
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(`\n${tests.length} backend tests passed.`);
  }
})();
