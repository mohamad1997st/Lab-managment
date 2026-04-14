import { useEffect, useState } from 'react';
import api from '../api/api';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import {
  Paper,
  Typography,
  Stack,
  TextField,
  MenuItem,
  Button,
  Alert
} from '@mui/material';

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

export default function OperationForm() {
  const [employees, setEmployees] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errorMsg, setErrorMsg] = useState('');

  const isAcclimatization = form.phase_of_culture === 'Acclimatization';
  const selectedInventory = inventory.find((i) => String(i.id) === String(form.inventory_id));
  const eligibleInventory = inventory.filter((row) => {
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
    api.get('/employees').then((res) => setEmployees(res.data)).catch(() => {});
    api.get('/inventory').then((res) => setInventory(res.data)).catch(() => {});
  }, []);

  const reset = () => {
    setForm(emptyForm);
  };

  const submit = async () => {
    try {
      setSaving(true);
      setErrorMsg('');

      const payload = {
        operations_date: form.operations_date,
        employee_id: Number(form.employee_id),
        inventory_id: Number(form.inventory_id),
        used_mother_jars: Number(form.used_mother_jars),
        number_new_jars: isAcclimatization ? Number(form.used_mother_jars) : Number(form.number_new_jars),
        phase_of_culture: form.phase_of_culture,
        number_of_shootlets: isAcclimatization ? Number(form.number_of_shootlets) : null,
        number_of_cultured_trays: isAcclimatization ? Number(form.number_of_cultured_trays) : null,
        number_of_rooted_shoots: isAcclimatization ? Number(form.number_of_rooted_shoots) : null,
        rooting_shoot_percentage: isAcclimatization ? Number(computedRootingPercentage) : null,
        subculture_new_jar:
          (form.phase_of_culture === 'Rooting' || form.phase_of_culture === 'Acclimatization')
            ? null
            : (form.subculture_new_jar === '' ? null : Number(form.subculture_new_jar))
      };

      await api.post('/daily-operations', payload);
      reset();
      alert('Operation saved successfully');
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Request failed';

      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    form.operations_date &&
    form.employee_id &&
    form.inventory_id &&
    form.used_mother_jars !== '' &&
    (!isAcclimatization ? form.number_new_jars !== '' : true) &&
    (!isAcclimatization || (
      form.number_of_shootlets !== '' &&
      form.number_of_cultured_trays !== '' &&
      form.number_of_rooted_shoots !== ''
    ));

  return (
    <Paper sx={{ p: 3, maxWidth: 850, mx: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <AssignmentIcon sx={{ color: '#166534' }} />
        <Typography variant="h5" fontWeight={800}>
          Daily Operation
        </Typography>
      </Stack>
      {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
      <Stack spacing={2}>
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
          label="Phase of Culture"
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

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Employee"
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            fullWidth
          >
            <MenuItem value="">
              <em>Select Employee</em>
            </MenuItem>
            {employees.map((emp) => (
              <MenuItem key={emp.id} value={emp.id}>
                {emp.full_name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label={isAcclimatization ? 'Inventory From Rooted Jar Species' : 'Inventory (Species / Phase / Subculture)'}
            value={form.inventory_id}
            onChange={(e) => setForm({ ...form, inventory_id: e.target.value })}
            helperText={
              selectedInventory
                ? `Source phase: ${selectedInventory.phase_of_culture}`
                : 'Select a source inventory compatible with the target phase'
            }
            fullWidth
          >
            <MenuItem value="">
              <em>Select Inventory</em>
            </MenuItem>
            {eligibleInventory.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.species_name} - {i.phase_of_culture} - Sub {i.subculture_mother_jars}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label={isAcclimatization ? 'Number of Jars' : 'Used mother jars'}
            type="number"
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
            error={errorMsg.toLowerCase().includes('used mother jars')}
            helperText={
              errorMsg.toLowerCase().includes('used mother jars')
                ? errorMsg
                : ''
            }
          />

          {!isAcclimatization && (
            <TextField
              label="Produced new jars"
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
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button variant="outlined" onClick={reset} disabled={saving} startIcon={<RestartAltIcon />}>
            Reset
          </Button>
          <Button variant="contained" onClick={submit} disabled={!canSave || saving} startIcon={<SaveIcon />}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
