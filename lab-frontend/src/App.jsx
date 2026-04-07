import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import Navbar, { SIDEBAR_WIDTH } from './components/Navbar';
import PageIntro from './components/PageIntro';
import Footer from './components/Footer';
import api from './api/api';
import SubscriptionAlertAction from './components/SubscriptionAlertAction';

const AuthGate = lazy(() => import('./pages/AuthGate'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Contamination = lazy(() => import('./pages/Contamination'));
const DailyOperations = lazy(() => import('./pages/DailyOperations'));
const InventoryAdjustments = lazy(() => import('./pages/InventoryAdjustments'));
const Reports = lazy(() => import('./pages/Reports'));
const Performance = lazy(() => import('./pages/Performance'));
const LabProfile = lazy(() => import('./pages/LabProfile'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SpeciesManager = lazy(() => import('./pages/SpeciesManager'));
const EmployeesManager = lazy(() => import('./pages/EmployeesManager'));
const UsersManager = lazy(() => import('./pages/UsersManager'));
const InviteAccept = lazy(() => import('./pages/InviteAccept'));
const OwnerSettings = lazy(() => import('./pages/OwnerSettings'));
const Subscription = lazy(() => import('./pages/Subscription'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NewsletterSubscribers = lazy(() => import('./pages/NewsletterSubscribers'));

function AuthLoading({ label }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '60vh' }} spacing={2}>
      <CircularProgress />
      <Typography variant="body2" sx={{ opacity: 0.7 }}>
        {label}
      </Typography>
    </Stack>
  );
}

function ProtectedRoute({ isAuthenticated, authChecked, currentUser, allowedRoles, children }) {
  const location = useLocation();

  if (!authChecked) {
    return <AuthLoading label="Checking your workspace..." />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (allowedRoles?.length && !allowedRoles.includes(currentUser?.role)) {
    return <Navigate to="/daily-operations" replace />;
  }

  return children;
}

function RouteLoader({ children }) {
  return (
    <Suspense fallback={<AuthLoading label="Opening page..." />}>
      {children}
    </Suspense>
  );
}

function getSubscriptionBannerTone(subscription) {
  if (!subscription) {
    return {
      severity: 'info',
      sx: {}
    };
  }

  if (subscription.status === 'expired') {
    return {
      severity: 'error',
      sx: {
        border: '1px solid rgba(183, 28, 28, 0.28)',
        backgroundColor: 'rgba(255, 235, 238, 0.96)',
        boxShadow: '0 10px 24px rgba(183, 28, 28, 0.12)'
      }
    };
  }

  if (subscription.status === 'past_due' || subscription.status === 'canceled') {
    return {
      severity: 'warning',
      sx: {
        border: '1px solid rgba(245, 124, 0, 0.28)',
        backgroundColor: 'rgba(255, 243, 224, 0.96)',
        boxShadow: '0 10px 24px rgba(245, 124, 0, 0.12)'
      }
    };
  }

  return {
    severity: subscription.is_active ? 'info' : 'warning',
    sx: {
      border: '1px solid rgba(2, 136, 209, 0.18)',
      backgroundColor: 'rgba(227, 242, 253, 0.9)'
    }
  };
}

function getRelativeDayLabel(targetDate, { pastLabel, futureLabel }) {
  if (!targetDate) return '';

  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return '';

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / dayMs);

  if (diffDays === 0) {
    return futureLabel === 'ends'
      ? 'Ends today.'
      : 'Expired today.';
  }

  if (diffDays > 0) {
    return `${futureLabel} in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
  }

  const elapsedDays = Math.abs(diffDays);
  return `${pastLabel} ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago.`;
}

function getSubscriptionBannerMessage(subscription) {
  if (!subscription) return '';

  const trialCountdown = getRelativeDayLabel(subscription.trial_ends_at, {
    pastLabel: 'Trial ended',
    futureLabel: 'Trial ends'
  });

  const planCountdown = getRelativeDayLabel(subscription.ends_at, {
    pastLabel: 'Plan expired',
    futureLabel: 'Plan ends'
  });

  if (subscription.status === 'expired') {
    return `${subscription.plan_label} plan is expired. Subscription-protected actions are blocked until the plan is renewed. ${planCountdown || trialCountdown}`.trim();
  }

  if (subscription.status === 'past_due') {
    return `${subscription.plan_label} plan is past due. Please review billing soon to avoid blocked workspace actions. ${planCountdown}`.trim();
  }

  if (subscription.status === 'canceled') {
    return `${subscription.plan_label} plan is canceled. Access may be reduced when the current billing period ends. ${planCountdown}`.trim();
  }

  if (subscription.status === 'trialing') {
    return `${subscription.plan_label} plan is trialing. ${trialCountdown}`.trim();
  }

  return `${subscription.plan_label} plan is ${subscription.status_label.toLowerCase()}. ${planCountdown}`.trim();
}

function getUsageWarningItems(subscription) {
  const usage = subscription?.usage;
  if (!usage) return [];

  const checks = [
    { label: 'Users', current: usage.users, limit: subscription.max_users },
    { label: 'Employees', current: usage.employees, limit: subscription.max_employees },
    { label: 'Species', current: usage.species, limit: subscription.max_species }
  ];

  return checks.filter((item) => {
    if (item.limit === null || item.limit === undefined || item.limit <= 0) return false;
    return item.current / item.limit >= 0.8;
  }).map((item) => ({
    ...item,
    reached: item.current >= item.limit
  }));
}

function getUsageWarningSummary(subscription) {
  const items = getUsageWarningItems(subscription);
  if (items.length === 0) {
    return { label: '', text: '', reached: false };
  }

  const reached = items.some((item) => item.reached);
  const label = reached ? 'Limit reached' : 'Near limit';
  const text = items
    .map((item) => `${item.label}: ${item.current} / ${item.limit}`)
    .join('  |  ');

  return { label, text, reached };
}

function AppShell() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentLab, setCurrentLab] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      try {
        const res = await api.get('/auth/me');
        if (active) {
          setIsAuthenticated(true);
          setCurrentUser(res.data?.user || null);
          setCurrentLab(res.data?.lab || null);
        }
      } catch {
        if (active) {
          setIsAuthenticated(false);
          setCurrentUser(null);
          setCurrentLab(null);
        }
      } finally {
        if (active) setAuthChecked(true);
      }
    };

    checkAuth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const isPublicInvite = location.pathname.startsWith('/invite/');
    const isPublicReset = location.pathname.startsWith('/reset-password/');
    if (!authChecked) return;
    if (!isAuthenticated && location.pathname !== '/login' && !isPublicInvite && !isPublicReset) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
    }
  }, [authChecked, isAuthenticated, location.pathname, navigate]);

  const handleLoginSuccess = async () => {
    try {
      const res = await api.get('/auth/me');
      setIsAuthenticated(true);
      setCurrentUser(res.data?.user || null);
      setCurrentLab(res.data?.lab || null);
    } catch {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setCurrentLab(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentLab(null);
    setAuthChecked(true);
  };

  const isInvitePage = location.pathname.startsWith('/invite/');
  const isResetPage = location.pathname.startsWith('/reset-password/');
  const showAppChrome = authChecked && isAuthenticated && location.pathname !== '/login' && !isInvitePage && !isResetPage;
  const subscription = currentLab?.subscription || null;
  const showSubscriptionBanner = showAppChrome && roleNeedsBillingBanner(currentUser?.role);
  const subscriptionBanner = getSubscriptionBannerTone(subscription);
  const subscriptionBannerMessage = getSubscriptionBannerMessage(subscription);
  const usageWarning = getUsageWarningSummary(subscription);

  return (
    <>
      {authChecked && <Navbar isAuthenticated={isAuthenticated} currentUser={currentUser} onLogout={handleLogout} />}

      {!authChecked && <AuthLoading label="Loading Mother Roots..." />}

      <Box
        sx={{
          pl: showAppChrome ? { lg: `calc(${SIDEBAR_WIDTH}px + 32px)` } : 0,
          pr: showAppChrome ? { xs: 0, lg: 2 } : 0,
          pb: 3,
          display: authChecked ? 'flex' : 'none',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 72px)'
        }}
      >
        <Box sx={{ flex: 1 }}>
          {showAppChrome && <PageIntro />}
          {showSubscriptionBanner && subscription && (
            <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 2, px: 2 }}>
              <Alert
                severity={subscriptionBanner.severity}
                action={<SubscriptionAlertAction visible={currentUser?.role === 'owner'} />}
                sx={subscriptionBanner.sx}
              >
                <Stack spacing={0.4}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {subscriptionBannerMessage}
                  </Typography>
                  {usageWarning.text && (
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.9,
                        fontWeight: usageWarning.reached ? 800 : 600,
                        color: usageWarning.reached ? '#b71c1c' : 'inherit'
                      }}
                    >
                      {usageWarning.label}: {usageWarning.text}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            </Box>
          )}

          <Routes>
            <Route
              path="/login"
              element={
                authChecked && isAuthenticated
                  ? <Navigate to={currentUser?.role === 'staff' ? '/daily-operations' : '/dashboard'} replace />
                  : (
                    <RouteLoader>
                      <AuthGate onLoginSuccess={handleLoginSuccess} />
                    </RouteLoader>
                  )
              }
            />
            <Route
              path="/invite/:token"
              element={(
                <RouteLoader>
                  <InviteAccept onAccepted={handleLoginSuccess} />
                </RouteLoader>
              )}
            />
            <Route
              path="/reset-password/:token"
              element={(
                <RouteLoader>
                  <ResetPassword />
                </RouteLoader>
              )}
            />
            <Route
              path="/"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser}>
                  <Navigate to={currentUser?.role === 'staff' ? '/daily-operations' : '/dashboard'} replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner', 'manager']}>
                  <RouteLoader>
                    <Dashboard currentUser={currentUser} />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/lab"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner']}>
                  <RouteLoader>
                    <LabProfile />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/owner-settings"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner']}>
                  <RouteLoader>
                    <OwnerSettings />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner']}>
                  <RouteLoader>
                    <Subscription />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
          <Route
            path="/newsletter"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner']}>
                <RouteLoader>
                  <NewsletterSubscribers />
                </RouteLoader>
              </ProtectedRoute>
            }
          />
          <Route
            path="/species"
            element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner', 'manager']}>
                  <RouteLoader>
                    <SpeciesManager />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner', 'manager']}>
                  <RouteLoader>
                    <EmployeesManager />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner']}>
                  <RouteLoader>
                    <UsersManager />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner', 'manager']}>
                  <RouteLoader>
                    <Inventory />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/contamination"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser}>
                  <RouteLoader>
                    <Contamination currentUser={currentUser} />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/daily-operations"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser}>
                  <RouteLoader>
                    <DailyOperations currentUser={currentUser} />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser} allowedRoles={['owner', 'manager']}>
                  <RouteLoader>
                    <Reports />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory-adjustments"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser}>
                  <RouteLoader>
                    <InventoryAdjustments currentUser={currentUser} />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route
              path="/performance"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} authChecked={authChecked} currentUser={currentUser}>
                  <RouteLoader>
                    <Performance currentUser={currentUser} />
                  </RouteLoader>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={isAuthenticated ? (currentUser?.role === 'staff' ? '/daily-operations' : '/dashboard') : '/login'} replace />} />
          </Routes>
        </Box>

        {!isInvitePage && !isResetPage && location.pathname !== '/login' && (
          <Footer showAppChrome={showAppChrome} currentLab={currentLab} currentUser={currentUser} />
        )}
      </Box>
    </>
  );
}

function roleNeedsBillingBanner(role) {
  return role === 'owner' || role === 'manager';
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
