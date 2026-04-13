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

export default function OperationForm() {
  const [employees, setEmployees] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    operations_date: '',
    employee_id: '',
    inventory_id: '',
    used_mother_jars: '',
    number_new_jars: '',
    subculture_new_jar: '',
    phase_of_culture: 'Multiplication'
  });

  useEffect(() => {
    api.get('/employees').then(res => setEmployees(res.data)).catch(() => {});
    api.get('/inventory').then(res => setInventory(res.data)).catch(() => {});
  }, []);

  const reset = () => {
    setForm({
      operations_date: '',
      employee_id: '',
      inventory_id: '',
      used_mother_jars: '',
      number_new_jars: '',
      subculture_new_jar: '',
      phase_of_culture: 'Multiplication'
    });
  };
  const [errorMsg, setErrorMsg] = useState('');


  const submit = async () => {
  try {
    setSaving(true);
    setErrorMsg('');

    const payload = {
      operations_date: form.operations_date,
      employee_id: Number(form.employee_id),
      inventory_id: Number(form.inventory_id),
      used_mother_jars: Number(form.used_mother_jars),
      number_new_jars: Number(form.number_new_jars),
      phase_of_culture: form.phase_of_culture,
      subculture_new_jar:
        (form.phase_of_culture === 'Rooting' || form.phase_of_culture === 'Acclimatization')
          ? null
          : Number(form.subculture_new_jar)
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
    setSaving(false); // ✅ مهم جداً
  }
};
const _toArabicError = (msg) => {
  const m = (msg || '').toLowerCase();

  if (m.includes('used mother jars exceed available')) {
    return 'عدد الجرات المستخدمة أكبر من الموجود بالمخزون';
  }
  if (m.includes('contaminated jars cannot exceed')) {
    return 'عدد الجرات الملوّثة أكبر من عدد الجرات المنتَجة';
  }
  return msg || 'صار خطأ غير متوقع';
};


  const canSave =
    form.operations_date &&
    form.employee_id &&
    form.inventory_id &&
    form.used_mother_jars !== '' &&
    form.number_new_jars !== '' &&
    ((form.phase_of_culture === 'Rooting' || form.phase_of_culture === 'Acclimatization') || form.subculture_new_jar !== '');

  return (
    <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <AssignmentIcon sx={{ color: '#166534' }} />
        <Typography variant="h5" fontWeight={800}>
          Daily Operation
        </Typography>
      </Stack>
        {errorMsg && (<Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>)}
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
              ...form,
              phase_of_culture: phase,
              subculture_new_jar: (phase === 'Rooting' || phase === 'Acclimatization') ? '' : form.subculture_new_jar
            });
          }}
          fullWidth
        >
          <MenuItem value="Initiation">Initiation</MenuItem>
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
            {employees.map(emp => (
              <MenuItem key={emp.id} value={emp.id}>
                {emp.full_name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Inventory (Species / Subculture)"
            value={form.inventory_id}
            onChange={(e) => setForm({ ...form, inventory_id: e.target.value })}
            fullWidth
          >
            <MenuItem value="">
              <em>Select Inventory</em>
            </MenuItem>
            {inventory.map(i => (
              <MenuItem key={i.id} value={i.id}>
                {i.species_name} — Sub {i.subculture_mother_jars}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Used mother jars"
            type="number"
            value={form.used_mother_jars}
            onChange={(e) => setForm({ ...form, used_mother_jars: e.target.value })}
            fullWidth
            error={errorMsg.toLowerCase().includes('used mother jars')}
            helperText={
              errorMsg.toLowerCase().includes('used mother jars')
                ? errorMsg
                : ''
            }
          />
          <TextField
            label="Produced new jars"
            type="number"
            inputProps={{ min: 0 }}
            value={form.number_new_jars}
            onChange={(e) => setForm({ ...form, number_new_jars: e.target.value })}
            fullWidth
          />

          {/* ✅ يظهر فقط إذا ليست Rooting */}
          {form.phase_of_culture !== 'Rooting' && form.phase_of_culture !== 'Acclimatization' && (
            <TextField
              label="New subculture"
              type="number"
              inputProps={{ min: 0 }}
              value={form.subculture_new_jar}
              onChange={(e) => setForm({ ...form, subculture_new_jar: e.target.value })}
              fullWidth
            />
          )}
        </Stack>

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
