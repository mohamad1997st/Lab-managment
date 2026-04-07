import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { todayLocalYmd } from "../utils/date";
import InsightsIcon from "@mui/icons-material/Insights";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import SimpleLineChart from "../components/SimpleLineChart";
import SimpleBarChart from "../components/SimpleBarChart";

function ymdMinusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function Performance({ currentUser }) {
  const isStaff = currentUser?.role === "staff";
  const staffLabel = currentUser?.full_name || currentUser?.username || "Current staff user";
  const [tab, setTab] = useState(0);
  const [err, setErr] = useState("");
  const [from, setFrom] = useState(ymdMinusDays(120));
  const [to, setTo] = useState(todayLocalYmd());
  const [employeeRows, setEmployeeRows] = useState([]);
  const [speciesRows, setSpeciesRows] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [speciesId, setSpeciesId] = useState("");

  const fetchData = async () => {
    try {
      setErr("");
      const q = new URLSearchParams();
      if (from) q.append("from", from);
      if (to) q.append("to", to);

      const empRes = await api.get(`/reports/performance/employee?${q.toString()}`);
      setEmployeeRows(empRes.data?.rows || []);

      if (isStaff) {
        setSpeciesRows([]);
      } else {
        const spRes = await api.get(`/reports/performance/species-upgrades?${q.toString()}`);
        setSpeciesRows(spRes.data?.rows || []);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Request failed";
      setErr(msg);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  const employees = useMemo(() => {
    const map = new Map();
    (employeeRows || []).forEach((r) => {
      if (!map.has(r.employee_id)) map.set(r.employee_id, r.full_name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [employeeRows]);

  const species = useMemo(() => {
    const map = new Map();
    (speciesRows || []).forEach((r) => {
      if (!map.has(r.species_id)) map.set(r.species_id, r.species_name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [speciesRows]);

  useEffect(() => {
    if (!employeeId && employees.length) setEmployeeId(String(employees[0].id));
  }, [employees, employeeId]);

  useEffect(() => {
    if (!speciesId && species.length) setSpeciesId(String(species[0].id));
  }, [species, speciesId]);

  const employeeSeries = useMemo(() => {
    if (!employeeId) return [];
    const rows = (employeeRows || [])
      .filter((r) => String(r.employee_id) === String(employeeId))
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));

    return rows.map((r) => ({
      xLabel: r.month,
      y: Number(r.new_jars ?? 0),
      operations: Number(r.operations ?? 0),
      used: Number(r.used_mother_jars ?? 0),
    }));
  }, [employeeRows, employeeId]);

  const employeeTotals = useMemo(() => {
    const t = { ops: 0, used: 0, newJars: 0 };
    employeeSeries.forEach((p) => {
      t.ops += Number(p.operations || 0);
      t.used += Number(p.used || 0);
      t.newJars += Number(p.y || 0);
    });
    return t;
  }, [employeeSeries]);

  const speciesSeries = useMemo(() => {
    if (!speciesId) return [];
    const rows = (speciesRows || [])
      .filter((r) => String(r.species_id) === String(speciesId))
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));

    return rows.map((r) => ({
      month: r.month,
      new_jars: Number(r.new_jars ?? 0),
      upgrades: Number(r.upgrades ?? 0),
    }));
  }, [speciesRows, speciesId]);

  const upgradesBars = useMemo(() => {
    return (speciesSeries || []).map((r) => ({
      label: r.month,
      value: r.upgrades,
      color: r.upgrades > 0 ? "#2e7d32" : "#cbd5e1",
    }));
  }, [speciesSeries]);

  return (
    <Stack spacing={2} sx={{ maxWidth: 1200, mx: "auto", mt: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <InsightsIcon sx={{ color: "#166534" }} />
          <Typography variant="h5" fontWeight={900}>
            Performance
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ opacity: 0.75 }}>
          {isStaff ? "Your own work performance over time." : "Employee improvement and species upgrades over time (by month)."}
        </Typography>
        {isStaff && (
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#166534", fontWeight: 700 }}>
            Viewing: {staffLabel}
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        {err ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        ) : null}

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
          <TextField
            label="From"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            fullWidth
          />
          <TextField
            label="To"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={fetchData} sx={{ minWidth: 140 }} startIcon={<RefreshIcon />}>
            Refresh
          </Button>
        </Stack>

        <Box sx={{ mt: 2 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Employees" />
            {!isStaff && <Tab label="Species" />}
          </Tabs>
        </Box>

        {tab === 0 || isStaff ? (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                select
                label="Employee"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                fullWidth
              >
                {employees.map((e) => (
                  <MenuItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Total operations"
                value={employeeTotals.ops}
                fullWidth
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Total new jars"
                value={employeeTotals.newJars}
                fullWidth
                InputProps={{ readOnly: true }}
              />
            </Stack>

            <SimpleLineChart
              title="New jars per month"
              points={employeeSeries.map((p) => ({ xLabel: p.xLabel, y: p.y }))}
              yLabel="New jars"
            />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              select
              label="Species"
              value={speciesId}
              onChange={(e) => setSpeciesId(e.target.value)}
              fullWidth
            >
              {species.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            <SimpleLineChart
              title="New jars per month"
              points={speciesSeries.map((r) => ({ xLabel: r.month, y: r.new_jars }))}
              yLabel="New jars"
            />

            <SimpleBarChart title="Upgrades per month" bars={upgradesBars} />
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
