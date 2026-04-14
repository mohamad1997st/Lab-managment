import { useEffect, useState } from 'react';
import api from '../api/api';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Alert, Paper, Typography, Stack, TextField, MenuItem, Button, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer
} from '@mui/material';
import SubscriptionAlertAction from '../components/SubscriptionAlertAction';
import { downloadPdf } from '../utils/pdfDownload';
import { getFriendlyApiError, hasSubscriptionResolution } from '../utils/subscriptionErrors';

const asArray = (value) => (Array.isArray(value) ? value : []);
const allowedTargetsBySourcePhase = {
  Initiation: ['Multiplication'],
  Multiplication: ['Multiplication', 'Rooting'],
  Rooting: ['Acclimatization']
};

const emptyForm = {
  operations_date: '',
  employee_id: '',
  inventory_id: '',
  used_mother_jars: '',
  number_new_jars: '',
  subculture_new_jar: '',
  phase_of_culture: 'Multiplication',
  number_of_shootlets: '',
  number_of_cultured_trays: '',
  number_of_rooted_shoots: ''
};

export default function DailyOperations({ currentUser }) {
  const isStaff = currentUser?.role === 'staff';
  const staffLabel = currentUser?.full_name || currentUser?.username || 'Current staff user';
  const [employees, setEmployees] = useState([]);
  const [species, setSpecies] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [ops, setOps] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, limit: 30 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({
    month: '',
    employee_id: '',
    species_id: '',
    phase: ''
  });

  const isAcclimatization = form.phase_of_culture === 'Acclimatization';
  const selectedInventory = asArray(inventory).find((i) => String(i.id) === String(form.inventory_id));
  const availableMotherJars = selectedInventory ? Number(selectedInventory.number_mother_jar ?? 0) : null;
  const eligibleInventory = asArray(inventory).filter((row) => {
    const allowedTargets = allowedTargetsBySourcePhase[row.phase_of_culture];
    return Array.isArray(allowedTargets) && allowedTargets.includes(form.phase_of_culture);
  });

  const computedRootingPercentage =
    isAcclimatization &&
    form.number_of_shootlets !== '' &&
    Number(form.number_of_shootlets) > 0 &&
    form.number_of_rooted_shoots !== ''
      ? ((Number(form.number_of_rooted_shoots) / Number(form.number_of_shootlets)) * 100).toFixed(2)
      : '0.00';

  useEffect(() => {
    if (!isStaff) {
      api.get('/employees').then((res) => setEmployees(asArray(res.data)));
      api.get('/species').then((res) => setSpecies(asArray(res.data)));
      api.get('/inventory').then((res) => setInventory(asArray(res.data)));
    }
    fetchOps(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  async function fetchOps(newPage = 1, f = filters) {
    const params = new URLSearchParams();
    params.append('page', String(newPage));
    params.append('limit', '30');

    if (f.month) params.append('month', f.month);
    if (!isStaff && f.employee_id) params.append('employee_id', f.employee_id);
    if (!isStaff && f.species_id) params.append('species_id', f.species_id);
    if (f.phase) params.append('phase', f.phase);

    const res = await api.get(`/daily-operations?${params.toString()}`);
    setOps(asArray(res.data?.data));
    setMeta({
      total: res.data.total ?? 0,
      totalPages: res.data.totalPages ?? 1,
      limit: res.data.limit ?? 30
    });
    setPage(res.data.page ?? newPage);
  }

  const submit = async () => {
    try {
      setError('');
      setSuccess('');
      setShowSubscriptionAction(false);

      await api.post('/daily-operations', {
        ...form,
        used_mother_jars: Number(form.used_mother_jars),
        number_new_jars: isAcclimatization ? Number(form.used_mother_jars) : Number(form.number_new_jars),
        employee_id: Number(form.employee_id),
        inventory_id: Number(form.inventory_id),
        number_of_shootlets: isAcclimatization ? Number(form.number_of_shootlets) : null,
        number_of_cultured_trays: isAcclimatization ? Number(form.number_of_cultured_trays) : null,
        number_of_rooted_shoots: isAcclimatization ? Number(form.number_of_rooted_shoots) : null,
        rooting_shoot_percentage: isAcclimatization ? Number(computedRootingPercentage) : null,
        subculture_new_jar:
          (form.phase_of_culture === 'Rooting' || form.phase_of_culture === 'Acclimatization')
            ? null
            : (form.subculture_new_jar === '' ? null : Number(form.subculture_new_jar))
      });

      setSuccess('Operation saved successfully.');
      resetForm();
      await fetchOps(1, filters);
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'save a daily operation'));
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
  };

  const resetFilters = () => {
    const empty = { month: '', employee_id: '', species_id: '', phase: '' };
    setFilters(empty);
    fetchOps(1, empty);
  };

  const exportFilteredPdf = async () => {
    const params = new URLSearchParams();
    if (filters.month) params.append('month', filters.month);
    if (filters.employee_id) params.append('employee_id', filters.employee_id);
    if (filters.species_id) params.append('species_id', filters.species_id);
    if (filters.phase) params.append('phase', filters.phase);

    try {
      setError('');
      setShowSubscriptionAction(false);
      await downloadPdf(`/reports/operations/pdf?${params.toString()}`, 'operations-report.pdf');
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'export an operations PDF'));
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1150, mx: 'auto', mt: 3, px: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <AssignmentIcon sx={{ color: '#166534' }} />
          <Typography variant="h5" fontWeight={800}>
            Daily Operation
          </Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction && !isStaff} />}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {isStaff ? (
          <Stack spacing={0.75}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#166534' }}>
              Viewing: {staffLabel}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.75 }}>
              Staff accounts can only view their own daily operations.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Operation Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.operations_date}
                onChange={(e) => setForm({ ...form, operations_date: e.target.value })}
                fullWidth
              />

              <TextField
                select
                label="Phase"
                value={form.phase_of_culture}
                onChange={(e) => {
                  const phase = e.target.value;
                  setForm({
                    ...emptyForm,
                    operations_date: form.operations_date,
                    employee_id: form.employee_id,
                    phase_of_culture: phase
                  });
                }}
                fullWidth
              >
                <MenuItem value="Multiplication">Multiplication</MenuItem>
                <MenuItem value="Rooting">Rooting</MenuItem>
                <MenuItem value="Acclimatization">Acclimatization</MenuItem>
              </TextField>

              <TextField
                select
                label="Employee"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                fullWidth
              >
                <MenuItem value=""><em>Select</em></MenuItem>
                {asArray(employees).map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              select
              label={isAcclimatization ? 'Inventory From Rooted Jar Species' : 'Inventory (Species / Subculture)'}
              value={form.inventory_id}
              onChange={(e) => setForm({ ...form, inventory_id: e.target.value })}
              fullWidth
              helperText={
                selectedInventory
                  ? `Available mother jars: ${availableMotherJars}. Source phase: ${selectedInventory.phase_of_culture}.`
                  : 'Select a source inventory compatible with the target phase'
              }
            >
              <MenuItem value=""><em>Select</em></MenuItem>
              {eligibleInventory.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.species_name} - {i.phase_of_culture} - Sub {i.subculture_mother_jars} - Mother jars: {i.number_mother_jar} (ID {i.id})
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={isAcclimatization ? 'Number of Jars' : 'Used mother jars'}
                type="number"
                inputProps={{ min: 0 }}
                value={form.used_mother_jars}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm({
                    ...form,
                    used_mother_jars: value,
                    number_new_jars: isAcclimatization ? value : form.number_new_jars
                  });
                }}
                fullWidth
              />

              {!isAcclimatization && (
                <TextField
                  label="New jars"
                  type="number"
                  inputProps={{ min: 0 }}
                  value={form.number_new_jars}
                  onChange={(e) => setForm({ ...form, number_new_jars: e.target.value })}
                  fullWidth
                />
              )}

              {form.phase_of_culture === 'Multiplication' && (
                <TextField
                  label="New subculture"
                  type="number"
                  inputProps={{ min: 0 }}
                  value={form.subculture_new_jar}
                  onChange={(e) => setForm({ ...form, subculture_new_jar: e.target.value })}
                  helperText={selectedInventory ? 'Leave blank to auto-use the next multiplication subculture.' : ''}
                  fullWidth
                />
              )}
            </Stack>

            {isAcclimatization && (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Number of Shootlets"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={form.number_of_shootlets}
                    onChange={(e) => setForm({ ...form, number_of_shootlets: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Number of Cultured Trays"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={form.number_of_cultured_trays}
                    onChange={(e) => setForm({ ...form, number_of_cultured_trays: e.target.value })}
                    fullWidth
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Number of Rooted Shoots"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={form.number_of_rooted_shoots}
                    onChange={(e) => setForm({ ...form, number_of_rooted_shoots: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Percentage of Rooting Shoots"
                    value={`${computedRootingPercentage}%`}
                    InputProps={{ readOnly: true }}
                    fullWidth
                  />
                </Stack>
              </>
            )}

            <Stack direction="row" spacing={2} justifyContent="flexend">
              <Button variant="outlined" onClick={resetForm} startIcon={<RestartAltIcon />}>Reset</Button>
              <Button
                variant="contained"
                onClick={submit}
                disabled={
                  !form.operations_date ||
                  !form.employee_id ||
                  !form.inventory_id ||
                  form.used_mother_jars === '' ||
                  (!isAcclimatization && form.number_new_jars === '') ||
                  (isAcclimatization && (
                    form.number_of_shootlets === '' ||
                    form.number_of_cultured_trays === '' ||
                    form.number_of_rooted_shoots === ''
                  ))
                }
                startIcon={<SaveIcon />}
              >
                Save
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <ListAltIcon sx={{ color: '#166534' }} />
          <Typography variant="h6" fontWeight={800}>
            Operations List
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ opacity: 0.75, mb: 2 }}>
          {isStaff ? 'Review your own operations history.' : 'Filter by month, employee, species, or phase.'}
        </Typography>

        {isStaff && (
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#166534', fontWeight: 700 }}>
            Viewing: {staffLabel}
          </Typography>
        )}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Month"
            type="month"
            InputLabelProps={{ shrink: true }}
            value={filters.month}
            onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            fullWidth
          />

          {!isStaff && (
            <TextField
              select
              label="Employee"
              value={filters.employee_id}
              onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}
              fullWidth
            >
              <MenuItem value=""><em>All</em></MenuItem>
              {asArray(employees).map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>
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
              {asArray(species).map((sp) => (
                <MenuItem key={sp.id} value={sp.id}>{sp.species_name}</MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select
            label="Phase"
            value={filters.phase}
            onChange={(e) => setFilters({ ...filters, phase: e.target.value })}
            fullWidth
          >
            <MenuItem value=""><em>All</em></MenuItem>
            <MenuItem value="Multiplication">Multiplication</MenuItem>
            <MenuItem value="Rooting">Rooting</MenuItem>
            <MenuItem value="Acclimatization">Acclimatization</MenuItem>
          </TextField>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => fetchOps(1, filters)} startIcon={<FilterAltIcon />}>
              Apply
            </Button>
            <Button variant="outlined" onClick={resetFilters} startIcon={<RestartAltIcon />}>
              Reset
            </Button>
            {!isStaff && (
              <Button
                variant="contained"
                color="success"
                onClick={exportFilteredPdf}
                disabled={!filters.month && !filters.employee_id && !filters.species_id && !filters.phase}
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
                <TableCell>Date</TableCell>
                <TableCell>Employee</TableCell>
                <TableCell>Species</TableCell>
                <TableCell>Mother Sub</TableCell>
                <TableCell>Phase</TableCell>
                <TableCell align="left">Used</TableCell>
                <TableCell align="left">New</TableCell>
                <TableCell align="left">New Sub</TableCell>
                <TableCell align="left">Acclim Details</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {asArray(ops).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ opacity: 0.7 }}>
                    No operations found
                  </TableCell>
                </TableRow>
              ) : (
                asArray(ops).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>{String(row.operations_date).slice(0, 10)}</TableCell>
                    <TableCell>{row.full_name}</TableCell>
                    <TableCell>{row.species_name}</TableCell>
                    <TableCell>{row.subculture_mother_jars}</TableCell>
                    <TableCell>{row.phase_of_culture}</TableCell>
                    <TableCell align="left">{row.used_mother_jars}</TableCell>
                    <TableCell align="left">{row.number_new_jars}</TableCell>
                    <TableCell align="left">{row.subculture_new_jar ?? ''}</TableCell>
                    <TableCell align="left">
                      {row.phase_of_culture === 'Acclimatization'
                        ? `Shootlets: ${row.number_of_shootlets ?? 0}, Trays: ${row.number_of_cultured_trays ?? 0}, Rooted: ${row.number_of_rooted_shoots ?? 0}, ${row.rooting_shoot_percentage ?? 0}%`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            disabled={page <= 1}
            onClick={() => fetchOps(page - 1, filters)}
            startIcon={<ChevronLeftIcon />}
          >
            Prev
          </Button>
          <Typography sx={{ alignSelf: 'center', opacity: 0.8 }}>
            Page {page} / {meta.totalPages} (Total: {meta.total})
          </Typography>
          <Button
            variant="outlined"
            disabled={page >= meta.totalPages}
            onClick={() => fetchOps(page + 1, filters)}
            endIcon={<ChevronRightIcon />}
          >
            Next
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
