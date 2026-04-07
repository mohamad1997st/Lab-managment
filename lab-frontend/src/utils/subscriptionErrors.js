const quotaLabels = {
  max_users: 'user seats',
  max_employees: 'employees',
  max_species: 'species'
};

const pickQuotaLabel = (subscription, fallbackError) => {
  const matchedKey = Object.keys(quotaLabels).find((key) => fallbackError?.toLowerCase().includes(key.replace('max_', '').replace('_', ' ')));
  if (matchedKey) return quotaLabels[matchedKey];

  if (fallbackError?.toLowerCase().includes('user limit')) return quotaLabels.max_users;
  if (fallbackError?.toLowerCase().includes('employee limit')) return quotaLabels.max_employees;
  if (fallbackError?.toLowerCase().includes('species limit')) return quotaLabels.max_species;

  return subscription?.max_users !== null || subscription?.max_employees !== null || subscription?.max_species !== null
    ? 'workspace limits'
    : 'plan limits';
};

export function getFriendlyApiError(error, actionLabel = 'complete this action') {
  const status = error?.response?.status;
  const responseError = error?.response?.data?.error;
  const subscription = error?.response?.data?.subscription;
  const planLabel = subscription?.plan_label || 'Current';
  const statusLabel = (subscription?.status_label || 'Subscription').toLowerCase();

  if (status === 402 && subscription) {
    return `${planLabel} plan is ${statusLabel}. Renew or reactivate the subscription to ${actionLabel}.`;
  }

  if (status === 403 && subscription) {
    const quotaLabel = pickQuotaLabel(subscription, responseError || '');
    return `${responseError || 'Your current plan limit has been reached.'} Upgrade the plan or raise the ${quotaLabel} limit in Subscription to ${actionLabel}.`;
  }

  return responseError || error?.message || 'Something went wrong.';
}

export function hasSubscriptionResolution(error) {
  const status = error?.response?.status;
  return status === 402 || status === 403;
}
