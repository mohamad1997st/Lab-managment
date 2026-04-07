import { useEffect, useState } from 'react';
import api from '../api/api';
import ContaminationForm from '../components/ContaminationForm';
import { todayLocalYmd } from '../utils/date';
import BugReportIcon from '@mui/icons-material/BugReport';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import {
  Alert, Paper, Typography, Stack, TextField, MenuItem, Button, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer
} from '@mui/material';
import SubscriptionAlertAction from '../components/SubscriptionAlertAction';
import { downloadPdf } from '../utils/pdfDownload';
import { getFriendlyApiError, hasSubscriptionResolution } from '../utils/subscriptionErrors';

export default function Contamination({ currentUser }) {
  const isStaff = currentUser?.role === 'staff';
  const staffLabel = currentUser?.full_name || currentUser?.username || 'Current staff user';
  const [employees, setEmployees] = useState([]);
  const [species, setSpecies] = useState([]);
  const [operations, setOperations] = useState([]);
  const [form, setForm] = useState({
    operation_id: '',
    employee_id: '',
    detected_date: todayLocalYmd(),
    contaminated_jars: '',
    contamination_type: '',
    notes: ''
  });
  const [list, setList] = useState([]);
  const [filters, setFilters] = useState({
    employee_id: '',
    species_id: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  useEffect(() => {
    api.get('/employees').then((res) => setEmployees(res.data));
    if (!isStaff) {
      api.get('/species').then((res) => setSpecies(res.data));
    }

    const loadAllOperations = async () => {
      const limit = 500;
      let page = 1;
      let totalPages = 1;
      const all = [];

      while (page <= totalPages) {
        const res = await api.get('/daily-operations', { params: { page, limit } });
        const payload = res.data ?? {};
        const rows = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        all.push(...rows);
        totalPages = Number(payload.totalPages ?? 1);
        page += 1;
      }

      setOperations(all);
    };

    if (!isStaff) {
      loadAllOperations();
    }
  }, [isStaff]);

  const exportContaminationPdf = async () => {
    const params = new URLSearchParams();
    if (filters.employee_id) params.append('employee_id', filters.employee_id);
    if (filters.species_id) params.append('species_id', filters.species_id);

    try {
      setError('');
      setShowSubscriptionAction(false);
      await downloadPdf(`/reports/contamination/filtered/pdf?${params.toString()}`, 'contamination-report.pdf');
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'export a contamination PDF'));
    }
  };

  const fetchList = async (f = filters) => {
    const params = {};
    if (!isStaff && f.employee_id) params.employee_id = f.employee_id;
    if (!isStaff && f.species_id) params.species_id = f.species_id;

    const res = await api.get('/contamination', { params });
    setList(res.data);
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  const submit = async () => {
    try {
      setError('');
      setSuccess('');
      setShowSubscriptionAction(false);
      await api.post('/contamination', {
        ...form,
        operation_id: Number(form.operation_id),
        employee_id: Number(form.employee_id),
        contaminated_jars: Number(form.contaminated_jars)
      });

      setSuccess('Contamination recorded successfully.');
      await fetchList();
    } catch (err) {
      setShowSubscriptionAction(hasSubscriptionResolution(err));
      setError(getFriendlyApiError(err, 'save a contamination record'));
    }
  };

  const resetFilters = async () => {
    const cleared = { employee_id: '', species_id: '' };
    setFilters(cleared);
    await fetchList(cleared);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1300, mx: 'auto', mt: 3, px: 2 }}>
      {!isStaff && (
        <ContaminationForm
          employees={employees}
          operations={operations}
          form={form}
          setForm={setForm}
          onSubmit={submit}
        />
      )}

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <BugReportIcon sx={{ color: '#166534' }} />
          <Typography variant="h6" fontWeight={800}>
            Contamination List
          </Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction && !isStaff} />}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Typography variant="body2" sx={{ opacity: 0.75, mb: 2 }}>
          {isStaff ? 'Staff accounts can only view their own contamination records.' : 'Filter by employee or species.'}
        </Typography>

        {isStaff && (
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#166534', fontWeight: 700 }}>
            Viewing: {staffLabel}
          </Typography>
        )}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          {!isStaff && (
            <TextField
              select
              label="Employee"
              value={filters.employee_id}
              onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}
              fullWidth
            >
              <MenuItem value=""><em>All</em></MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.full_name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {!isStaff && (
            <TextField
              select
              label="Species"
              value={filters.species_id}
              onChange={(e) => setFilters({ ...filters, species_id: e.target.value })}
              fullWidth
            >
              <MenuItem value=""><em>All</em></MenuItem>
              {species.map((sp) => (
                <MenuItem key={sp.id} value={sp.id}>
                  {sp.species_name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => fetchList(filters)} startIcon={<FilterAltIcon />}>
              Apply
            </Button>
            <Button variant="outlined" onClick={resetFilters} startIcon={<RestartAltIcon />}>
              Reset
            </Button>
            {!isStaff && (
              <Button
                variant="contained"
                color="success"
                onClick={exportContaminationPdf}
                disabled={!filters.employee_id && !filters.species_id}
                startIcon={<PictureAsPdfIcon />}
              >
                PDF
              </Button>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Detected Date</TableCell>
              <TableCell>Employee</TableCell>
              <TableCell>Species</TableCell>
              <TableCell>Subculture</TableCell>
              <TableCell>Culture Date</TableCell>
              <TableCell>Produced</TableCell>
              <TableCell>Contaminated</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} sx={{ opacity: 0.7 }}>
                  No contamination records found
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{String(row.detected_date).slice(0, 10)}</TableCell>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell>{row.species_name}</TableCell>
                  <TableCell>{row.subculture_new_jar ?? '-'}</TableCell>
                  <TableCell>{row.operations_date ? String(row.operations_date).slice(0, 10) : '-'}</TableCell>
                  <TableCell>{row.produced_jars ?? '-'}</TableCell>
                  <TableCell>{row.contaminated_jars}</TableCell>
                  <TableCell>{row.contamination_type || '-'}</TableCell>
                  <TableCell>{row.notes || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
