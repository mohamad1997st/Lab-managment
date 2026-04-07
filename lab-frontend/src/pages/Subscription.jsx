import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import SaveIcon from '@mui/icons-material/Save';
import api from '../api/api';
import { downloadPdf } from '../utils/pdfDownload';

const PLANS = [
  { value: 'trial', label: 'Trial' },
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'custom', label: 'Custom' }
];

const STATUSES = [
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'expired', label: 'Expired' }
];

const PLAN_CARDS = [
  {
    key: 'trial',
    title: 'Trial',
    price: 'Free',
    blurb: 'A short setup period to validate the workspace before billing starts.',
    highlights: ['Quick launch', 'Core workflows', 'Short evaluation window'],
    defaults: { status: 'trialing', durationDays: 14, maxUsers: 3, maxEmployees: 10, maxSpecies: 20 }
  },
  {
    key: 'starter',
    title: 'Starter',
    price: '$29/mo',
    blurb: 'Best for small labs getting consistent daily usage.',
    highlights: ['Basic reporting', 'Controlled team size', 'Owner-led workspace'],
    defaults: { status: 'active', durationDays: 30, maxUsers: 5, maxEmployees: 20, maxSpecies: 30 }
  },
  {
    key: 'growth',
    title: 'Growth',
    price: '$79/mo',
    blurb: 'For labs with more employees, more species, and heavier reporting needs.',
    highlights: ['Higher quotas', 'Operational scale', 'Better headroom'],
    defaults: { status: 'active', durationDays: 30, maxUsers: 12, maxEmployees: 50, maxSpecies: 80 }
  },
  {
    key: 'enterprise',
    title: 'Enterprise',
    price: 'Custom',
    blurb: 'For advanced labs that need larger limits and tailored support.',
    highlights: ['Custom limits', 'Priority support', 'Flexible rollout'],
    defaults: { status: 'active', durationDays: 30, maxUsers: null, maxEmployees: null, maxSpecies: null }
  }
];

const toInputDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const emptyToNullNumber = (value) => {
  if (value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getRelativeDayLabel = (targetDate, { pastLabel, futureLabel }) => {
  if (!targetDate) return '';

  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return '';

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / dayMs);

  if (diffDays === 0) {
    return futureLabel === 'ends' ? 'Ends today.' : 'Expired today.';
  }
  if (diffDays > 0) {
    return `${futureLabel} in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
  }

  const elapsedDays = Math.abs(diffDays);
  return `${pastLabel} ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago.`;
};

const getSubscriptionSummary = (form) => {
  const planLabel = PLANS.find((option) => option.value === form.subscription_plan)?.label || 'Plan';
  const statusLabel = STATUSES.find((option) => option.value === form.subscription_status)?.label || 'Status';

  const trialCountdown = getRelativeDayLabel(form.trial_ends_at, {
    pastLabel: 'Trial ended',
    futureLabel: 'Trial ends'
  });
  const planCountdown = getRelativeDayLabel(form.subscription_ends_at, {
    pastLabel: 'Plan expired',
    futureLabel: 'Plan ends'
  });

  if (form.subscription_status === 'expired') {
    return {
      severity: 'error',
      text: `${planLabel} plan is expired. ${planCountdown || trialCountdown}`.trim()
    };
  }

  if (form.subscription_status === 'past_due') {
    return {
      severity: 'warning',
      text: `${planLabel} plan is past due. ${planCountdown}`.trim()
    };
  }

  if (form.subscription_status === 'canceled') {
    return {
      severity: 'warning',
      text: `${planLabel} plan is canceled. ${planCountdown}`.trim()
    };
  }

  if (form.subscription_status === 'trialing') {
    return {
      severity: 'info',
      text: `${planLabel} plan is ${statusLabel.toLowerCase()}. ${trialCountdown}`.trim()
    };
  }

  return {
    severity: 'success',
    text: `${planLabel} plan is ${statusLabel.toLowerCase()}. ${planCountdown}`.trim()
  };
};

const formatDateTimeLocal = (date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const addDaysLocal = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateTimeLocal(date);
};

export default function Subscription() {
  const BILLING_PAGE_SIZE = 5;
  const [form, setForm] = useState({
    subscription_plan: 'trial',
    subscription_status: 'trialing',
    subscription_starts_at: '',
    subscription_ends_at: '',
    trial_ends_at: '',
    max_users: '3',
    max_employees: '10',
    max_species: '20'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usage, setUsage] = useState({ users: 0, employees: 0, species: 0 });
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingStatusFilter, setBillingStatusFilter] = useState('all');
  const [billingEventFilter, setBillingEventFilter] = useState('all');
  const [billingSearch, setBillingSearch] = useState('');
  const [visibleBillingCount, setVisibleBillingCount] = useState(BILLING_PAGE_SIZE);
  const [billingProvider, setBillingProvider] = useState({ provider: 'stripe', configured: false });
  const [subscriptionMeta, setSubscriptionMeta] = useState({ isStripeManaged: false, billingProvider: 'manual' });
  const [dialog, setDialog] = useState({ open: false, title: '', body: '' });
  const subscriptionSummary = getSubscriptionSummary(form);
  const activePlanCard = PLAN_CARDS.find((plan) => plan.key === form.subscription_plan);
  const isStripeManaged = subscriptionMeta.isStripeManaged;
  const filteredBillingHistory = billingHistory.filter((record) => {
    const matchesStatus = billingStatusFilter === 'all' || record.status === billingStatusFilter;
    const matchesEvent = billingEventFilter === 'all' || record.event_type === billingEventFilter;
    const needle = billingSearch.trim().toLowerCase();
    const matchesSearch = !needle ||
      record.plan_label?.toLowerCase().includes(needle) ||
      record.plan_code?.toLowerCase().includes(needle) ||
      record.notes?.toLowerCase().includes(needle);
    return matchesStatus && matchesEvent && matchesSearch;
  });
  const visibleBillingHistory = filteredBillingHistory.slice(0, visibleBillingCount);

  const loadPage = async () => {
    try {
      setLoading(true);
      const [labRes, billingRes, billingConfigRes] = await Promise.all([
        api.get('/labs/me'),
        api.get('/labs/me/billing-history'),
        api.get('/billing/config').catch(() => ({ data: { provider: 'stripe', configured: false } }))
      ]);
      const billingConfig = billingConfigRes?.data || { provider: 'stripe', configured: false };

      const subscription = labRes.data?.subscription || {};
      setForm({
        subscription_plan: subscription.plan || 'trial',
        subscription_status: subscription.status || 'trialing',
        subscription_starts_at: toInputDateTime(subscription.starts_at),
        subscription_ends_at: toInputDateTime(subscription.ends_at),
        trial_ends_at: toInputDateTime(subscription.trial_ends_at),
        max_users: subscription.max_users === null ? '' : String(subscription.max_users ?? 3),
        max_employees: subscription.max_employees === null ? '' : String(subscription.max_employees ?? 10),
        max_species: subscription.max_species === null ? '' : String(subscription.max_species ?? 20)
      });
      setUsage(subscription.usage || { users: 0, employees: 0, species: 0 });
      setSubscriptionMeta({
        isStripeManaged: Boolean(subscription.is_stripe_managed),
        billingProvider: subscription.billing_provider || 'manual'
      });
      setBillingHistory(billingRes.data || []);
      setBillingProvider(billingConfig || { provider: 'stripe', configured: false });
      setVisibleBillingCount(BILLING_PAGE_SIZE);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    const params = new URLSearchParams(window.location.search);
    const billingState = params.get('billing');
    if (billingState === 'success') {
      setSuccess('Stripe checkout completed. The subscription will update after webhook sync.');
    } else if (billingState === 'cancelled') {
      setError('Stripe checkout was cancelled before payment was completed.');
    }
    if (billingState) {
      params.delete('billing');
      const nextSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
    }
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = {
        subscription_plan: form.subscription_plan,
        subscription_status: form.subscription_status,
        subscription_starts_at: form.subscription_starts_at || null,
        subscription_ends_at: form.subscription_ends_at || null,
        trial_ends_at: form.trial_ends_at || null,
        max_users: emptyToNullNumber(form.max_users),
        max_employees: emptyToNullNumber(form.max_employees),
        max_species: emptyToNullNumber(form.max_species)
      };

      const res = await api.put('/labs/me/subscription', payload);
      const subscription = res.data?.subscription || {};

      setForm({
        subscription_plan: subscription.plan || 'trial',
        subscription_status: subscription.status || 'trialing',
        subscription_starts_at: toInputDateTime(subscription.starts_at),
        subscription_ends_at: toInputDateTime(subscription.ends_at),
        trial_ends_at: toInputDateTime(subscription.trial_ends_at),
        max_users: subscription.max_users === null ? '' : String(subscription.max_users ?? ''),
        max_employees: subscription.max_employees === null ? '' : String(subscription.max_employees ?? ''),
        max_species: subscription.max_species === null ? '' : String(subscription.max_species ?? '')
      });
      setUsage(subscription.usage || { users: 0, employees: 0, species: 0 });
      setSubscriptionMeta({
        isStripeManaged: Boolean(subscription.is_stripe_managed),
        billingProvider: subscription.billing_provider || 'manual'
      });
      setSuccess('Subscription settings updated.');
      await loadPage();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const closeDialog = () => setDialog({ open: false, title: '', body: '' });

  const resetBillingWindow = () => setVisibleBillingCount(BILLING_PAGE_SIZE);

  const applyPlanDefaults = (planKey) => {
    const plan = PLAN_CARDS.find((item) => item.key === planKey);
    if (!plan) return;

    const startsAt = formatDateTimeLocal(new Date());
    const endsAt = addDaysLocal(plan.defaults.durationDays);
    const isTrial = planKey === 'trial';

    setForm((prev) => ({
      ...prev,
      subscription_plan: planKey,
      subscription_status: plan.defaults.status,
      subscription_starts_at: startsAt,
      subscription_ends_at: isTrial ? '' : endsAt,
      trial_ends_at: isTrial ? endsAt : prev.trial_ends_at,
      max_users: plan.defaults.maxUsers === null ? '' : String(plan.defaults.maxUsers),
      max_employees: plan.defaults.maxEmployees === null ? '' : String(plan.defaults.maxEmployees),
      max_species: plan.defaults.maxSpecies === null ? '' : String(plan.defaults.maxSpecies)
    }));

    setSuccess(`${plan.title} plan values loaded into the manual subscription form. Review and save when ready.`);
    setError('');
  };

  const handleUpgradePlan = () => {
    if (isStripeManaged) {
      openStripePortal();
      return;
    }
    const nextPlan = form.subscription_plan === 'trial' ? 'starter' : 'growth';
    applyPlanDefaults(nextPlan);
  };

  const startStripeCheckout = async (planKey = form.subscription_plan) => {
    try {
      setError('');
      setSuccess('');
      if (!billingProvider.configured) {
        setError('Stripe checkout is not configured yet on the backend.');
        return;
      }
      const planLabel = PLANS.find((item) => item.value === planKey)?.label || planKey;
      const res = await api.post('/billing/checkout-session', {
        plan_code: planKey,
        plan_label: planLabel
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      setError('Stripe checkout URL was not returned by the backend.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const openStripePortal = async () => {
    try {
      setError('');
      setSuccess('');
      if (!billingProvider.configured) {
        setError('Stripe billing portal is not configured yet on the backend.');
        return;
      }
      const res = await api.post('/billing/portal-session');
      if (res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      setError('Stripe portal URL was not returned by the backend.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const handleRenewSubscription = () => {
    if (isStripeManaged) {
      openStripePortal();
      return;
    }
    const durationDays = form.subscription_plan === 'trial' ? 14 : 30;
    const renewedEndsAt = addDaysLocal(durationDays);
    const nextStatus = form.subscription_plan === 'trial' ? 'trialing' : 'active';

    setForm((prev) => ({
      ...prev,
      subscription_status: nextStatus,
      subscription_starts_at: prev.subscription_starts_at || formatDateTimeLocal(new Date()),
      subscription_ends_at: prev.subscription_plan === 'trial' ? prev.subscription_ends_at : renewedEndsAt,
      trial_ends_at: prev.subscription_plan === 'trial' ? renewedEndsAt : prev.trial_ends_at
    }));
    const planLabel = PLANS.find((item) => item.value === form.subscription_plan)?.label || form.subscription_plan;
    const activeCard = PLAN_CARDS.find((item) => item.key === form.subscription_plan);
    const amountCents = parsePriceToCents(activeCard?.price);

    api.post('/labs/me/billing-history', {
      event_type: 'renewal',
      plan_code: form.subscription_plan,
      plan_label: planLabel,
      amount_cents: amountCents,
      currency: 'USD',
      status: 'issued',
      period_starts_at: form.subscription_starts_at || formatDateTimeLocal(new Date()),
      period_ends_at: form.subscription_plan === 'trial' ? renewedEndsAt : renewedEndsAt,
      notes: 'Manual renewal recorded from the Subscription page.'
    })
      .then((res) => {
        setBillingHistory((prev) => [res.data, ...prev]);
        setSuccess('Renewal values were applied to the form and a billing history record was created.');
        setError('');
      })
      .catch((e) => setError(e?.response?.data?.error || e.message));
  };

  const handleInvoiceDownload = async (billingRecord = billingHistory[0]) => {
    if (!billingRecord?.id) {
      setDialog({
        open: true,
        title: 'No invoice available',
        body: 'Create a renewal or billing record first, then download the generated invoice from billing history.'
      });
      return;
    }

    try {
      await downloadPdf(`/labs/me/billing-history/${billingRecord.id}/invoice`, `invoice-${billingRecord.id}.pdf`);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const handleMarkAsPaid = async (billingRecord) => {
    try {
      const res = await api.patch(`/labs/me/billing-history/${billingRecord.id}`, {
        status: 'paid',
        notes: 'Marked as paid from the Subscription page.'
      });
      setBillingHistory((prev) => prev.map((item) => (
        item.id === billingRecord.id ? res.data : item
      )));
      setSuccess(`Billing record #${billingRecord.id} marked as paid.`);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  return (
    <Paper sx={{ maxWidth: 900, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <CreditCardIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Subscription</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Subscription and billing controls for the MVP. Manual overrides still work, and Stripe checkout can now be connected for live payments.
          </Typography>
        </div>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <Alert severity={subscriptionSummary.severity}>
          {subscriptionSummary.text || 'Update the plan dates and limits for this workspace.'}
        </Alert>
        <Alert severity="info">
          Leave a limit blank to treat it as unlimited.
        </Alert>
        {isStripeManaged && (
          <Alert severity="info">
            This lab is managed by Stripe. Plan, renewal, and cancellation are synced by Stripe webhook, while this page can still adjust quota limits.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, bgcolor: '#fcfcfd' }}>
          <Stack spacing={1.5}>
            <div>
              <Typography variant="h6" fontWeight={900}>
                Billing Snapshot
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                This is the owner-facing billing area for the MVP. It supports manual billing controls today and can hand off to Stripe when the backend is configured.
              </Typography>
            </div>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
              <InfoTile
                label="Current Plan"
                value={activePlanCard?.title || form.subscription_plan}
                note={activePlanCard?.price || 'Manual billing'}
              />
              <InfoTile
                label="Status"
                value={STATUSES.find((item) => item.value === form.subscription_status)?.label || form.subscription_status}
                note="Controlled manually for now"
              />
              <InfoTile
                label="Payment Method"
                value={billingProvider.configured ? 'Stripe' : 'Not connected'}
                note={isStripeManaged ? 'Stripe is the source of truth for billing lifecycle' : (billingProvider.configured ? 'Live checkout is available' : 'Add Stripe keys and price IDs to enable payments')}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
              <Button variant="contained" sx={{ fontWeight: 800 }} onClick={handleUpgradePlan}>
                {isStripeManaged ? 'Manage Plan' : 'Upgrade Plan'}
              </Button>
              <Button
                variant="contained"
                color="success"
                sx={{ fontWeight: 800 }}
                onClick={() => startStripeCheckout(form.subscription_plan === 'trial' ? 'starter' : form.subscription_plan)}
                disabled={!billingProvider.configured}
              >
                Pay with Stripe
              </Button>
              <Button
                variant="outlined"
                sx={{ fontWeight: 800 }}
                onClick={openStripePortal}
                disabled={!billingProvider.configured}
              >
                Billing Portal
              </Button>
              <Button variant="outlined" sx={{ fontWeight: 800 }} onClick={handleRenewSubscription}>
                {isStripeManaged ? 'Renew in Portal' : 'Renew Subscription'}
              </Button>
              <Button variant="outlined" sx={{ fontWeight: 800 }} onClick={handleInvoiceDownload}>
                Download Invoice
              </Button>
            </Stack>
            {!billingProvider.configured && (
              <Alert severity="info">
                Stripe checkout is not configured yet. Add Stripe env vars and price IDs on the backend to enable live billing.
              </Alert>
            )}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <div>
              <Typography variant="h6" fontWeight={900}>
                Billing History
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                Manual records created from renewals and billing actions. Use them as the MVP source for invoices and renewal tracking.
              </Typography>
            </div>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} flexWrap="wrap">
              <TextField
                select
                label="Billing Status Filter"
                value={billingStatusFilter}
                onChange={(e) => {
                  setBillingStatusFilter(e.target.value);
                  resetBillingWindow();
                }}
                sx={{ maxWidth: 240 }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="issued">Issued</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="void">Void</MenuItem>
              </TextField>

              <TextField
                select
                label="Event Type Filter"
                value={billingEventFilter}
                onChange={(e) => {
                  setBillingEventFilter(e.target.value);
                  resetBillingWindow();
                }}
                sx={{ maxWidth: 240 }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="renewal">Renewal</MenuItem>
                <MenuItem value="upgrade">Upgrade</MenuItem>
                <MenuItem value="invoice">Invoice</MenuItem>
              </TextField>

              <TextField
                label="Search Plan or Notes"
                value={billingSearch}
                onChange={(e) => {
                  setBillingSearch(e.target.value);
                  resetBillingWindow();
                }}
                placeholder="Starter, growth, manual..."
                sx={{ minWidth: 260 }}
              />
            </Stack>

            {billingHistory.length === 0 ? (
              <Alert severity="info">No billing records yet. Renew the subscription to create the first invoice record.</Alert>
            ) : filteredBillingHistory.length === 0 ? (
              <Alert severity="info">No billing records match the current filters.</Alert>
            ) : (
              <Stack spacing={1}>
                <Typography variant="caption" sx={{ opacity: 0.72 }}>
                  Showing {visibleBillingHistory.length} of {filteredBillingHistory.length} record{filteredBillingHistory.length === 1 ? '' : 's'}.
                </Typography>
                {visibleBillingHistory.map((record) => (
                  <Paper
                    key={record.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2.5, bgcolor: '#fff' }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.2}>
                      <div>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.4, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2" fontWeight={900}>
                            {record.plan_label}
                          </Typography>
                          <Chip size="small" label={record.event_type} />
                          <Chip size="small" label={record.status} color={record.status === 'paid' ? 'success' : 'default'} />
                        </Stack>
                        <Typography variant="body2" sx={{ opacity: 0.78 }}>
                          {formatMoney(record.amount_cents, record.currency)} | {formatDateRange(record.period_starts_at, record.period_ends_at)}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.68 }}>
                          Created {new Date(record.created_at).toLocaleString()}
                        </Typography>
                      </div>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        {record.status !== 'paid' && (
                          <Button variant="contained" color="success" onClick={() => handleMarkAsPaid(record)}>
                            Mark as Paid
                          </Button>
                        )}
                        <Button variant="outlined" onClick={() => handleInvoiceDownload(record)}>
                          Download Invoice
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
                {filteredBillingHistory.length > visibleBillingCount && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignSelf: 'flex-start' }}>
                    <Button
                      variant="outlined"
                      onClick={() => setVisibleBillingCount((prev) => prev + BILLING_PAGE_SIZE)}
                      sx={{ fontWeight: 800 }}
                    >
                      Show More
                    </Button>
                    {visibleBillingCount > BILLING_PAGE_SIZE && (
                      <Button
                        variant="text"
                        onClick={() => setVisibleBillingCount(BILLING_PAGE_SIZE)}
                        sx={{ fontWeight: 800 }}
                      >
                        Show Less
                      </Button>
                    )}
                  </Stack>
                )}
                {filteredBillingHistory.length <= visibleBillingCount && visibleBillingCount > BILLING_PAGE_SIZE && (
                  <Button
                    variant="text"
                    onClick={() => setVisibleBillingCount(BILLING_PAGE_SIZE)}
                    sx={{ alignSelf: 'flex-start', fontWeight: 800 }}
                  >
                    Show Less
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <div>
              <Typography variant="h6" fontWeight={900}>
                Plan Options
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                A visual billing layer for owners. You can still load plan defaults into the manual form, and paid plans can also open Stripe checkout directly.
              </Typography>
            </div>

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
              {PLAN_CARDS.map((plan) => {
                const isActive = plan.key === form.subscription_plan;
                return (
                  <Paper
                    key={plan.key}
                    variant="outlined"
                    sx={{
                      flex: 1,
                      p: 2,
                      borderRadius: 3,
                      borderColor: isActive ? '#166534' : 'rgba(148, 163, 184, 0.32)',
                      background: isActive
                        ? 'linear-gradient(180deg, rgba(220, 252, 231, 0.7), rgba(255,255,255,1))'
                        : 'linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(255,255,255,1))'
                    }}
                  >
                    <Stack spacing={1.2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1" fontWeight={900}>
                          {plan.title}
                        </Typography>
                        {isActive && <Chip size="small" label="Current" color="success" />}
                      </Stack>
                      <Typography variant="h6" fontWeight={900}>
                        {plan.price}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.76, minHeight: 44 }}>
                        {plan.blurb}
                      </Typography>
                      <Divider />
                      <Stack spacing={0.6}>
                        {plan.highlights.map((item) => (
                          <Typography key={item} variant="body2" sx={{ opacity: 0.82 }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Button
                        variant={isActive ? 'outlined' : 'contained'}
                        sx={{ mt: 1, fontWeight: 800 }}
                        onClick={() => {
                          if (isActive) {
                            setDialog({
                              open: true,
                              title: `${plan.title} already active`,
                              body: 'This plan is already selected. You can still adjust dates or limits in the manual form below.'
                            });
                            return;
                          }
                          if (isStripeManaged) {
                            openStripePortal();
                            return;
                          }
                          applyPlanDefaults(plan.key);
                        }}
                      >
                        {isActive ? 'Current Plan' : (isStripeManaged ? 'Manage in Portal' : `${plan.title}`)}
                      </Button>
                      {!isActive && !isStripeManaged && (
                        <Button
                          variant="text"
                          sx={{ fontWeight: 800 }}
                          disabled={!billingProvider.configured || plan.key === 'trial'}
                          onClick={() => startStripeCheckout(plan.key)}
                        >
                          Checkout in Stripe
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Stack>
        </Paper>

        <UsageMeter
          label="Users"
          current={usage.users}
          limit={emptyToNullNumber(form.max_users)}
        />
        <UsageMeter
          label="Employees"
          current={usage.employees}
          limit={emptyToNullNumber(form.max_employees)}
        />
        <UsageMeter
          label="Species"
          current={usage.species}
          limit={emptyToNullNumber(form.max_species)}
        />

        <TextField
          select
          label="Plan"
          value={form.subscription_plan}
          onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}
          disabled={loading || isStripeManaged}
        >
          {PLANS.map((option) => (
            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Status"
          value={form.subscription_status}
          onChange={(e) => setForm({ ...form, subscription_status: e.target.value })}
          disabled={loading || isStripeManaged}
        >
          {STATUSES.map((option) => (
            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          label="Subscription Starts At"
          type="datetime-local"
          value={form.subscription_starts_at}
          onChange={(e) => setForm({ ...form, subscription_starts_at: e.target.value })}
          disabled={loading || isStripeManaged}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          label="Subscription Ends At"
          type="datetime-local"
          value={form.subscription_ends_at}
          onChange={(e) => setForm({ ...form, subscription_ends_at: e.target.value })}
          disabled={loading || isStripeManaged}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          label="Trial Ends At"
          type="datetime-local"
          value={form.trial_ends_at}
          onChange={(e) => setForm({ ...form, trial_ends_at: e.target.value })}
          disabled={loading || isStripeManaged}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          label="Max Users"
          type="number"
          value={form.max_users}
          onChange={(e) => setForm({ ...form, max_users: e.target.value })}
          disabled={loading}
        />

        <TextField
          label="Max Employees"
          type="number"
          value={form.max_employees}
          onChange={(e) => setForm({ ...form, max_employees: e.target.value })}
          disabled={loading}
        />

        <TextField
          label="Max Species"
          type="number"
          value={form.max_species}
          onChange={(e) => setForm({ ...form, max_species: e.target.value })}
          disabled={loading}
        />

        <Button variant="contained" onClick={save} disabled={loading || saving} startIcon={<SaveIcon />}>
          {saving ? 'Saving...' : (isStripeManaged ? 'Save Limit Overrides' : 'Save Subscription')}
        </Button>
      </Stack>

      <Dialog open={dialog.open} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">{dialog.body}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function parsePriceToCents(price) {
  if (!price || price.toLowerCase() === 'free' || price.toLowerCase() === 'custom') return null;
  const match = price.match(/(\d+)/);
  return match ? Number(match[1]) * 100 : null;
}

function formatMoney(amountCents, currency = 'USD') {
  if (amountCents === null || amountCents === undefined) return 'Custom';
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

function formatDateRange(start, end) {
  const startLabel = start ? new Date(start).toLocaleDateString() : 'No start';
  const endLabel = end ? new Date(end).toLocaleDateString() : 'No end';
  return `${startLabel} -> ${endLabel}`;
}

function UsageMeter({ label, current, limit }) {
  const hasLimit = limit !== null;
  const progress = hasLimit && limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const tone = hasLimit && limit > 0 && current >= limit ? 'error' : progress >= 80 ? 'warning' : 'success';

  return (
    <Box sx={{ p: 1.5, border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 2, bgcolor: '#fff' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={800}>{label}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {hasLimit ? `${current} / ${limit}` : `${current} / Unlimited`}
        </Typography>
      </Stack>
      {hasLimit ? (
        <LinearProgress
          variant="determinate"
          value={progress}
          color={tone}
          sx={{ height: 10, borderRadius: 999, bgcolor: 'rgba(148, 163, 184, 0.18)' }}
        />
      ) : (
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          No quota limit is currently applied.
        </Typography>
      )}
    </Box>
  );
}

function InfoTile({ label, value, note }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: 2.5,
        border: '1px solid rgba(148, 163, 184, 0.24)',
        bgcolor: '#fff'
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.65 }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" fontWeight={900}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ opacity: 0.72 }}>
        {note}
      </Typography>
    </Box>
  );
}
