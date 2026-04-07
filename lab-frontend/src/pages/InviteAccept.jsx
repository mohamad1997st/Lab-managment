import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import api from '../api/api';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const buildUsernameSuggestion = (inviteData) => {
  const emailPrefix = String(inviteData?.email || '').split('@')[0].trim();
  if (emailPrefix) return emailPrefix;

  return String(inviteData?.full_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export default function InviteAccept({ onAccepted }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ username: '', full_name: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const loadInvite = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get(`/invites/public/${token}`);
        const inviteData = res.data?.invite || null;
        setInvite(inviteData);
        setForm((prev) => ({
          ...prev,
          username: prev.username || buildUsernameSuggestion(inviteData),
          full_name: inviteData?.full_name || ''
        }));
      } catch (e) {
        setError(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    };

    loadInvite();
  }, [token]);

  const acceptInvite = async () => {
    if (!form.full_name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!form.password.trim()) {
      setError('Password is required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await api.post(`/invites/public/${token}/accept`, {
        username: form.username,
        full_name: form.full_name,
        password: form.password
      });
      await onAccepted?.();
      navigate('/', { replace: true });
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520, mx: 'auto', mt: 6 }}>
      <Stack spacing={2.5}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <MarkEmailReadIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={800}>
              Accept Lab Invite
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            {loading
              ? 'Checking your invitation...'
              : invite
                ? `Join ${invite.lab_name} as ${invite.role}.`
                : 'This invitation could not be loaded.'}
          </Typography>
        </div>

        {error && <Alert severity="error">{error}</Alert>}

        {invite && !loading && (
          <>
            <Alert severity="info">
              Invited email: {invite.email}
            </Alert>
            <Alert severity="success">
              {invite.lab_name} invited you as a {invite.role}. Expires on {new Date(invite.expires_at).toLocaleString()}.
            </Alert>
            <TextField
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              helperText="You can keep the suggested username or change it."
            />
            <TextField
              label="Full Name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              helperText="Use at least 8 characters."
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
            <TextField
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            />
            <Button
              variant="contained"
              onClick={acceptInvite}
              disabled={saving || !form.full_name.trim() || !form.password.trim() || !form.confirmPassword.trim()}
              startIcon={<CheckCircleIcon />}
            >
              {saving ? 'Joining...' : 'Accept Invite'}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
