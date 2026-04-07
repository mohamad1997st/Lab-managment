import { Alert, Stack, TextField, Button, Paper, MenuItem, Typography } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { todayLocalYmd } from '../utils/date';

export default function ContaminationForm({
  employees = [],
  operations = [],
  onSubmit = () => {},
  setForm = () => {},
  form = {}
}) {
  const ops = Array.isArray(operations) ? operations : [];
  const emps = Array.isArray(employees) ? employees : [];
  const selectedOp = ops.find((o) => String(o?.id) === String(form.operation_id));

  const opLabel = (op) => {
    const d = op?.operations_date ? String(op.operations_date).slice(0, 10) : '-';
    const sp = op?.species_name ?? 'Unknown species';
    const emp = op?.full_name ?? 'Unknown employee';
    return `${d} - ${sp} - ${emp}`;
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <Paper sx={{ p: 3, maxWidth: 1300, mx: 'auto', mt: 3, width: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <BugReportIcon sx={{ color: '#166534' }} />
          <Typography variant="h5" fontWeight={700}>
            Contamination Form
          </Typography>
        </Stack>

        {ops.length === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No operations found. Add daily operations first.
          </Alert>
        )}

        {emps.length === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No employees found.
          </Alert>
        )}

        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label="Operation"
              margin="normal"
              value={form.operation_id ?? ''}
              onChange={(e) => setForm({ ...form, operation_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Select Operation</em>
              </MenuItem>
              {ops.map((op) => (
                <MenuItem key={op.id} value={op.id}>
                  {opLabel(op)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              label="Employee"
              margin="normal"
              value={form.employee_id ?? ''}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Select Employee</em>
              </MenuItem>
              {emps.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.full_name ?? `Employee #${emp.id}`}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              type="date"
              fullWidth
              label="Detected Date"
              margin="normal"
              InputLabelProps={{ shrink: true }}
              value={form.detected_date ?? ''}
              onChange={(e) => setForm({ ...form, detected_date: e.target.value })}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Contaminated Jars"
              type="number"
              fullWidth
              margin="normal"
              inputProps={{ min: 0 }}
              value={form.contaminated_jars ?? ''}
              onChange={(e) => setForm({ ...form, contaminated_jars: e.target.value })}
            />

            <TextField
              label="Produced Jars"
              type="number"
              fullWidth
              margin="normal"
              value={selectedOp?.number_new_jars ?? ''}
              disabled
            />

            <TextField
              label="Contamination Type"
              fullWidth
              margin="normal"
              value={form.contamination_type ?? ''}
              onChange={(e) => setForm({ ...form, contamination_type: e.target.value })}
              placeholder="e.g., fungal, bacterial, unknown"
            />

            <TextField
              label="Notes"
              fullWidth
              rows={3}
              margin="normal"
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() =>
              setForm({
                operation_id: '',
                employee_id: '',
                detected_date: todayLocalYmd(),
                contaminated_jars: '',
                contamination_type: '',
                notes: ''
              })
            }
            startIcon={<RestartAltIcon />}
          >
            Reset
          </Button>

          <Button
            variant="contained"
            fullWidth
            onClick={onSubmit}
            disabled={
              !form.operation_id ||
              !form.employee_id ||
              !form.detected_date ||
              form.contaminated_jars === '' ||
              Number(form.contaminated_jars) < 0 ||
              !form.contamination_type
            }
            startIcon={<SaveIcon />}
          >
            Save
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
