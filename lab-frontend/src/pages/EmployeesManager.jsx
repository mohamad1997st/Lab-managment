import { useEffect, useState } from 'react';
import api from '../api/api';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import SubscriptionAlertAction from '../components/SubscriptionAlertAction';
import { getFriendlyApiError, hasSubscriptionResolution } from '../utils/subscriptionErrors';

export default function EmployeesManager() {
  const [rows, setRows] = useState([]);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setShowSubscriptionAction(false);
      const res = await api.get('/employees?include_inactive=1');
      setRows(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      setSaving(true);
      setError('');
      setShowSubscriptionAction(false);
      await api.post('/employees', { full_name: fullName });
      setFullName('');
      await load();
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'add an employee'));
    } finally {
      setSaving(false);
    }
  };

  const setEmployeeActive = async (id, is_active) => {
    try {
      setUpdatingId(id);
      setError('');
      await api.patch(`/employees/${id}`, { is_active });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Paper sx={{ maxWidth: 1000, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <GroupsIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Employees</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Manage the employee list for this lab workspace.
          </Typography>
        </div>

        {error && <Alert severity="error" action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>{error}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Employee Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Button variant="contained" onClick={create} disabled={saving || !fullName.trim()} startIcon={<PersonAddAltIcon />}>
            {saving ? 'Saving...' : 'Add Employee'}
          </Button>
        </Stack>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Full Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>No employees added yet.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={row.is_active ? 'success' : 'default'}
                      variant={row.is_active ? 'filled' : 'outlined'}
                      label={row.is_active ? 'Active' : 'Left job'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {row.is_active ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        disabled={updatingId === row.id}
                        onClick={() => setEmployeeActive(row.id, false)}
                      >
                        Mark left
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={updatingId === row.id}
                        onClick={() => setEmployeeActive(row.id, true)}
                      >
                        Re-activate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );
}
