import { useEffect, useState } from "react";
import api from "../api/api";
import TuneIcon from "@mui/icons-material/Tune";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ListAltIcon from "@mui/icons-material/ListAlt";
import {
  Paper,
  Typography,
  Stack,
  TextField,
  MenuItem,
  Button,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Alert,
  Chip,
} from "@mui/material";
import SubscriptionAlertAction from "../components/SubscriptionAlertAction";
import { downloadPdf } from "../utils/pdfDownload";
import { getFriendlyApiError, hasSubscriptionResolution } from "../utils/subscriptionErrors";

export default function InventoryAdjustments({ currentUser }) {
  const isStaff = currentUser?.role === "staff";
  const staffLabel = currentUser?.full_name || currentUser?.username || "Current staff user";
  const [employees, setEmployees] = useState([]);
  const [species, setSpecies] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, limit: 30 });
  const [page, setPage] = useState(1);
  const [errMsg, setErrMsg] = useState("");
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);
  const [form, setForm] = useState({
    adjustment_date: "",
    inventory_id: "",
    employee_id: "",
    type: "CONTAMINATION",
    qty: "",
    notes: "",
  });
  const [filters, setFilters] = useState({
    date: "",
    employee_id: "",
    species_id: "",
    type: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const empRes = await api.get("/employees");
        setEmployees(empRes.data || []);

        if (!isStaff) {
          const [spRes, invRes] = await Promise.all([
            api.get("/species"),
            api.get("/inventory"),
          ]);
          setSpecies(spRes.data || []);
          setInventory(invRes.data || []);
        }

        await fetchList(1, filters);
      } catch (e) {
        setErrMsg(e?.response?.data?.error || e.message || "Error loading data");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  const fetchList = async (newPage = 1, f = filters) => {
    try {
      setErrMsg("");
      setShowSubscriptionAction(false);

      const params = new URLSearchParams();
      params.append("page", String(newPage));
      params.append("limit", "30");

      if (f.date) params.append("date", f.date);
      if (!isStaff && f.employee_id) params.append("employee_id", f.employee_id);
      if (!isStaff && f.species_id) params.append("species_id", f.species_id);
      if (f.type) params.append("type", f.type);

      const res = await api.get(`/inventory-adjustments?${params.toString()}`);

      setRows(res.data.data || []);
      setMeta({
        total: res.data.total || 0,
        totalPages: res.data.totalPages || 1,
        limit: res.data.limit || 30,
      });
      setPage(res.data.page || newPage);
    } catch (e) {
      setErrMsg(e?.response?.data?.error || e.message || "Failed to load list");
    }
  };

  const submit = async () => {
    try {
      setErrMsg("");
      setShowSubscriptionAction(false);

      if (!form.adjustment_date || !form.inventory_id || !form.type || form.qty === "") {
        return setErrMsg("Please fill required fields.");
      }

      await api.post("/inventory-adjustments", {
        adjustment_date: form.adjustment_date,
        inventory_id: Number(form.inventory_id),
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        type: form.type,
        qty: Number(form.qty),
        notes: form.notes || null,
      });

      setForm((prev) => ({ ...prev, qty: "", notes: "" }));
      await fetchList(1, filters);
      alert("Adjustment saved successfully");
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setErrMsg(getFriendlyApiError(e, "save an inventory adjustment"));
    }
  };

  const resetForm = () => {
    setForm({
      adjustment_date: "",
      inventory_id: "",
      employee_id: "",
      type: "CONTAMINATION",
      qty: "",
      notes: "",
    });
  };

  const applyFilters = async () => {
    await fetchList(1, filters);
  };

  const resetFilters = async () => {
    const empty = { date: "", employee_id: "", species_id: "", type: "" };
    setFilters(empty);
    await fetchList(1, empty);
  };

  const exportPdf = async () => {
    const params = new URLSearchParams();
    if (filters.date) params.append("date", filters.date);
    if (filters.employee_id) params.append("employee_id", filters.employee_id);
    if (filters.species_id) params.append("species_id", filters.species_id);
    if (filters.type) params.append("type", filters.type);

    try {
      setErrMsg("");
      setShowSubscriptionAction(false);
      await downloadPdf(`/reports/inventory-adjustments/pdf?${params.toString()}`, "inventory-adjustments-report.pdf");
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setErrMsg(getFriendlyApiError(e, "export an inventory adjustments PDF"));
    }
  };

  const prevPage = async () => {
    if (page <= 1) return;
    await fetchList(page - 1, filters);
  };

  const nextPage = async () => {
    if (page >= meta.totalPages) return;
    await fetchList(page + 1, filters);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1150, mx: "auto", mt: 3, pb: 4, px: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TuneIcon sx={{ color: "#166534" }} />
          <Typography variant="h5" fontWeight={900}>
            Inventory Adjustments
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ opacity: 0.75, mb: 2 }}>
          {isStaff
            ? "Staff accounts can only view their own adjustment records."
            : "Use this form to subtract jars from inventory (contamination/loss) even if there is no daily operation."}
        </Typography>

        {isStaff && (
          <Typography variant="caption" sx={{ display: "block", mb: 2, color: "#166534", fontWeight: 700 }}>
            Viewing: {staffLabel}
          </Typography>
        )}

        {errMsg && (
          <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction && !isStaff} />}>
            {errMsg}
          </Alert>
        )}

        {!isStaff && (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.adjustment_date}
                onChange={(e) => setForm({ ...form, adjustment_date: e.target.value })}
                fullWidth
              />

              <TextField
                select
                label="Type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                fullWidth
              >
                <MenuItem value="CONTAMINATION">CONTAMINATION</MenuItem>
                <MenuItem value="LOSS">LOSS</MenuItem>
                <MenuItem value="CORRECTION">CORRECTION</MenuItem>
              </TextField>

              <TextField
                select
                label="Employee (optional)"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                fullWidth
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              select
              label="Inventory (Species / Subculture)"
              value={form.inventory_id}
              onChange={(e) => setForm({ ...form, inventory_id: e.target.value })}
              fullWidth
            >
              <MenuItem value="">
                <em>Select inventory</em>
              </MenuItem>
              {inventory.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.species_name} - Sub {i.subculture_mother_jars} (Inv #{i.id})
                </MenuItem>
              ))}
            </TextField>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Qty (subtract)"
                type="number"
                inputProps={{ min: 1 }}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                fullWidth
              />

              <TextField
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                fullWidth
              />
            </Stack>

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={resetForm} startIcon={<RestartAltIcon />}>
                Reset
              </Button>

              <Button
                variant="contained"
                onClick={submit}
                disabled={!form.adjustment_date || !form.inventory_id || form.qty === ""}
                startIcon={<SaveIcon />}
              >
                Save Adjustment
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <ListAltIcon sx={{ color: "#166534" }} />
          <Typography variant="h6" fontWeight={900}>
            Adjustments List
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ opacity: 0.75, mb: 2 }}>
          {isStaff ? "Review your own adjustments." : "Filter by date, employee, species, or type. Export PDF with same filters."}
        </Typography>

        {isStaff && (
          <Typography variant="caption" sx={{ display: "block", mb: 2, color: "#166534", fontWeight: 700 }}>
            Viewing: {staffLabel}
          </Typography>
        )}

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
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
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
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
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              {species.map((sp) => (
                <MenuItem key={sp.id} value={sp.id}>
                  {sp.species_name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select
            label="Type"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            fullWidth
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            <MenuItem value="CONTAMINATION">CONTAMINATION</MenuItem>
            <MenuItem value="LOSS">LOSS</MenuItem>
            <MenuItem value="CORRECTION">CORRECTION</MenuItem>
          </TextField>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={applyFilters} startIcon={<FilterAltIcon />}>
              Apply
            </Button>
            <Button variant="outlined" onClick={resetFilters} startIcon={<RestartAltIcon />}>
              Reset
            </Button>
            {!isStaff && (
              <Button variant="contained" color="success" onClick={exportPdf} startIcon={<PictureAsPdfIcon />}>
                PDF
              </Button>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Chip label={`Total: ${meta.total}`} />
          <Chip label={`Page: ${page} / ${meta.totalPages}`} />
          <Chip label={`Limit: ${meta.limit}`} />
        </Stack>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Employee</TableCell>
              <TableCell>Species</TableCell>
              <TableCell>Subculture</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ opacity: 0.7 }}>
                  No adjustments found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.id}</TableCell>
                  <TableCell>{String(r.adjustment_date).slice(0, 10)}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell sx={{ color: "#1565C0", fontWeight: 700 }}>
                    {r.full_name || "-"}
                  </TableCell>
                  <TableCell>{r.species_name}</TableCell>
                  <TableCell>{r.subculture_mother_jars}</TableCell>
                  <TableCell align="right">{r.qty}</TableCell>
                  <TableCell>{r.notes || ""}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={prevPage} disabled={page <= 1} startIcon={<ChevronLeftIcon />}>
            Prev
          </Button>
          <Button variant="outlined" onClick={nextPage} disabled={page >= meta.totalPages} endIcon={<ChevronRightIcon />}>
            Next
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
