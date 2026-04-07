import { useEffect, useState } from 'react';
import api from '../api/api';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import EmailIcon from '@mui/icons-material/Email';
import GoogleIcon from '@mui/icons-material/Google';
import {
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Alert,
  Link,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  InputAdornment
} from '@mui/material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthGate({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState('');

  const [setupForm, setSetupForm] = useState({
    lab_name: '',
    username: '',
    full_name: '',
    email: '',
    password: ''
  });
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const nextPath = location.state?.from || '/dashboard';
  const oauthError = searchParams.get('oauth_error');

  const continueWithGoogle = () => {
    const params = new URLSearchParams({
      mode,
      redirect: nextPath
    });
    window.location.href = `${api.defaults.baseURL}/auth/google/start?${params.toString()}`;
  };

  useEffect(() => {
    const requestedMode = searchParams.get('mode');
    if (requestedMode === 'register') setMode('register');
    if (requestedMode === 'login') setMode('login');
  }, [searchParams]);

  const setup = async () => {
    try {
      setErr('');
      setLoading(true);
      await api.post('/auth/setup', setupForm);
      onLoginSuccess?.();
      navigate(nextPath, { replace: true });
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      setErr('');
      setLoading(true);
      await api.post('/auth/login', loginForm);
      onLoginSuccess?.();
      navigate(nextPath, { replace: true });
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    try {
      setErr('');
      setForgotSent('');
      setLoading(true);
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      const emailStatus = res.data?.email;
      if (emailStatus?.delivered) {
        setForgotSent('Reset email sent successfully.');
      } else if (emailStatus?.error) {
        setForgotSent('Reset link prepared, but the email could not be sent automatically yet.');
      } else {
        setForgotSent('If the account exists, a reset link has been prepared.');
      }
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 480, mx: 'auto', mt: 6 }}>
      <Stack spacing={2.5}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <AccountCircleIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={800}>
              Mother Roots Account
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Sign in to an existing lab or register a new lab workspace.
          </Typography>
        </div>

        <ToggleButtonGroup
          color="primary"
          value={mode}
          exclusive
          onChange={(_, value) => value && setMode(value)}
          fullWidth
        >
          <ToggleButton value="login">Login</ToggleButton>
          <ToggleButton value="register">Create Lab</ToggleButton>
        </ToggleButtonGroup>

        {err && <Alert severity="error">{err}</Alert>}
        {oauthError && <Alert severity="error">{oauthError}</Alert>}
        {forgotSent && <Alert severity="success">{forgotSent}</Alert>}

        {mode === 'register' ? (
          <Stack spacing={2}>
            <TextField
              label="Lab Name"
              value={setupForm.lab_name}
              onChange={(e) => setSetupForm({ ...setupForm, lab_name: e.target.value })}
            />
            <TextField
              label="Admin Username"
              value={setupForm.username}
              onChange={(e) => setSetupForm({ ...setupForm, username: e.target.value })}
            />
            <TextField
              label="Admin Full Name"
              value={setupForm.full_name}
              onChange={(e) => setSetupForm({ ...setupForm, full_name: e.target.value })}
            />
            <TextField
              label="Admin Email"
              value={setupForm.email}
              onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={setupForm.password}
              onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button variant="contained" onClick={setup} disabled={loading} startIcon={<PersonAddAltIcon />}>
              {loading ? 'Creating...' : 'Create Lab Account'}
            </Button>
            <Button variant="outlined" onClick={continueWithGoogle} disabled={loading} startIcon={<GoogleIcon />}>
              Create Lab with Google
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <TextField
              label="Email"
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button variant="contained" onClick={login} disabled={loading} startIcon={<LoginIcon />}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
            <Button variant="outlined" onClick={continueWithGoogle} disabled={loading} startIcon={<GoogleIcon />}>
              Continue with Google
            </Button>
            <DividerText />
            <TextField
              label="Forgot Password Email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            <Button variant="text" onClick={forgotPassword} disabled={loading || !forgotEmail.trim()} startIcon={<EmailIcon />}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              Open the reset link from your email, then set a new password.
            </Typography>
            <Link href="/login?mode=register" underline="hover" sx={{ alignSelf: 'flex-start' }}>
              Need a new lab account instead?
            </Link>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function DividerText() {
  return (
    <Typography variant="caption" sx={{ opacity: 0.65, textAlign: 'center' }}>
      Password help
    </Typography>
  );
}
