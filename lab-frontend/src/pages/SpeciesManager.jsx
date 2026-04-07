import { useEffect, useState } from 'react';
import api from '../api/api';
import ParkIcon from '@mui/icons-material/Park';
import AddIcon from '@mui/icons-material/Add';
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

export default function SpeciesManager() {
  const [rows, setRows] = useState([]);
  const [speciesName, setSpeciesName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setShowSubscriptionAction(false);
      const res = await api.get('/species');
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
      await api.post('/species', { species_name: speciesName });
      setSpeciesName('');
      await load();
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'add a species'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ maxWidth: 1000, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <ParkIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Species</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Add and review the species used by this lab only.
          </Typography>
        </div>

        {error && <Alert severity="error" action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>{error}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Species Name"
            value={speciesName}
            onChange={(e) => setSpeciesName(e.target.value)}
          />
          <Button variant="contained" onClick={create} disabled={saving || !speciesName.trim()} startIcon={<AddIcon />}>
            {saving ? 'Saving...' : 'Add Species'}
          </Button>
        </Stack>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Species Name</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2}>No species added yet.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.species_name}</TableCell>
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
