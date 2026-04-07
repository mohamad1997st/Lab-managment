import { useEffect, useMemo, useState } from 'react';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import api from '../api/api';

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
};

export default function NewsletterSubscribers() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const res = await api.get('/newsletter', {
        params: search.trim() ? { search: search.trim() } : {}
      });

      setRows(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const activeCount = rows.filter((row) => row.status === 'active').length;
    return {
      total: rows.length,
      active: activeCount
    };
  }, [rows]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    await load({ silent: true });
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1200, mx: 'auto', mt: 2, px: 2 }}>
      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <AlternateEmailIcon sx={{ color: '#166534' }} />
            <BoxSummary total={summary.total} active={summary.active} />
          </Stack>

          <Button
            variant="outlined"
            onClick={() => load({ silent: true })}
            startIcon={<RefreshIcon />}
            disabled={refreshing}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)' }}>
        <Stack component="form" onSubmit={handleSearchSubmit} direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            size="small"
            label="Search by email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="subscriber@example.com"
          />
          <Button type="submit" variant="contained" sx={{ minWidth: 140, textTransform: 'none', fontWeight: 800 }}>
            Search
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)', overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Subscribed</TableCell>
                <TableCell>Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" sx={{ py: 2, color: 'text.secondary' }}>
                      No newsletter signups found yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{row.email}</TableCell>
                  <TableCell>{row.source || 'footer'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status || 'active'}
                      color={row.status === 'active' ? 'success' : 'default'}
                      variant={row.status === 'active' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>{formatDateTime(row.subscribed_at)}</TableCell>
                  <TableCell>{formatDateTime(row.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}

function BoxSummary({ total, active }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
        Newsletter Signups
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {total} total subscribers, {active} active
      </Typography>
    </Stack>
  );
}
