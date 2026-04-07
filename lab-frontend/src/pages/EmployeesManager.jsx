import { useEffect, useState } from 'react';
import api from '../api/api';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import {
  Alert,
  Button,
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
  const [error, setError] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setShowSubscriptionAction(false);
      const res = await api.get('/employees');
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
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2}>No employees added yet.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.full_name}</TableCell>
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
