import { useEffect, useState } from 'react';
import api from '../api/api';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';

export default function OwnerSettings() {
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => setForm((prev) => ({
        ...prev,
        username: res.data?.user?.username || '',
        full_name: res.data?.user?.full_name || '',
        email: res.data?.user?.email || ''
      })))
      .catch((e) => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const res = await api.put('/auth/me', form);
      setForm({
        username: res.data?.user?.username || '',
        full_name: res.data?.user?.full_name || '',
        email: res.data?.user?.email || '',
        password: ''
      });
      setSuccess('Owner account updated.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ maxWidth: 900, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <SettingsIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Owner Settings</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Manage your owner account details and password separately from the lab profile.
          </Typography>
        </div>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <TextField
          label="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="Full Name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="New Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          disabled={loading}
          helperText="Leave blank if you do not want to change the password."
        />
        <Button variant="contained" onClick={save} disabled={loading || saving} startIcon={<SaveIcon />}>
          {saving ? 'Saving...' : 'Save Owner Settings'}
        </Button>
      </Stack>
    </Paper>
  );
}
