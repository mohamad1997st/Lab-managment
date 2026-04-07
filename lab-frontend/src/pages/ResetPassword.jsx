import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import api from '../api/api';
import KeyIcon from '@mui/icons-material/Key';
import SaveIcon from '@mui/icons-material/Save';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ password: '', confirmPassword: '' });

  useEffect(() => {
    const loadReset = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get(`/auth/reset-password/${token}`);
        setEmail(res.data?.reset?.email || '');
      } catch (e) {
        setError(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    };

    loadReset();
  }, [token]);

  const submit = async () => {
    if (!form.password.trim()) {
      setError('Enter a new password.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await api.post(`/auth/reset-password/${token}`, { password: form.password });
      setSuccess('Password reset successfully. You can sign in now.');
      setTimeout(() => navigate('/login', { replace: true }), 1200);
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
            <KeyIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={800}>
              Reset Password
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            {loading
              ? 'Checking your reset link...'
              : email
                ? `Create a new password for ${email}.`
                : 'This reset link could not be loaded.'}
          </Typography>
        </div>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        {!loading && !error && (
          <>
            <TextField
              label="New Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <TextField
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            />
            <Button variant="contained" onClick={submit} disabled={saving} startIcon={<SaveIcon />}>
              {saving ? 'Saving...' : 'Reset Password'}
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
