import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import DescriptionIcon from "@mui/icons-material/Description";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  FormControlLabel,
  FormGroup,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SubscriptionAlertAction from "../components/SubscriptionAlertAction";
import { downloadPdf } from "../utils/pdfDownload";
import { getFriendlyApiError, hasSubscriptionResolution } from "../utils/subscriptionErrors";

const EMPTY_BATCH_SELECTION = {
  inventory_all: false,
  inventory_active: false,
  inventory_empty: false,
  production: false,
  production_by_species: false,
  contamination: false,
  operations_filtered: false,
  contamination_filtered: false,
  daily_matrix: false,
  weekly_matrix: false,
};

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [species, setSpecies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  // General Filters (applied to all relevant exports)
  const [filters, setFilters] = useState({
    date: "",
    employee_id: "",
    species_id: "",
    phase: "",
  });

  const [batchSelected, setBatchSelected] = useState(() => ({ ...EMPTY_BATCH_SELECTION }));

  useEffect(() => {
    api.get("/employees").then((res) => setEmployees(res.data)).catch(() => {});
    api.get("/species").then((res) => setSpecies(res.data)).catch(() => {});
  }, []);

  const phases = useMemo(
    () => ["Initiation", "Multiplication", "Rooting", "Acclimatization"],
    []
  );

  const openPdf = async (path, fallbackName) => {
    setError("");
    setShowSubscriptionAction(false);
    try {
      await downloadPdf(path.replace(/^\/api/, ''), fallbackName);
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, "export a PDF report"));
      throw e;
    }
  };

  const buildQuery = (obj) => {
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        params.append(k, String(v));
      }
    });
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  // Inventory
  const exportInventoryAll = () => openPdf(`/api/reports/inventory/pdf${buildQuery({ species_id: filters.species_id })}`, "inventory-report.pdf");
  const exportInventoryActive = () =>
    openPdf(`/api/reports/inventory/pdf${buildQuery({ species_id: filters.species_id, view: "active" })}`, "inventory-active-report.pdf");
  const exportInventoryEmpty = () =>
    openPdf(`/api/reports/inventory/pdf${buildQuery({ species_id: filters.species_id, view: "empty" })}`, "inventory-empty-report.pdf");

  // Basics
  const exportProduction = () => openPdf("/api/reports/production/pdf", "production-report.pdf");
  const exportProductionBySpecies = () => openPdf("/api/reports/production-by-species/pdf", "production-by-species-report.pdf");
  const exportContamination = () => openPdf("/api/reports/contamination/pdf", "contamination-report.pdf");

  // Filtered PDFs
  const exportOperationsFiltered = () => {
    const month = filters.date ? String(filters.date).slice(0, 7) : "";
    return openPdf(
      `/api/reports/operations/pdf${buildQuery({
        month,
        employee_id: filters.employee_id,
        species_id: filters.species_id,
        phase: filters.phase,
      })}`,
      "operations-report.pdf"
    );
  };

  const exportContaminationFiltered = () => {
    const month = filters.date ? String(filters.date).slice(0, 7) : "";
    return openPdf(
      `/api/reports/contamination/filtered/pdf${buildQuery({
        month,
        employee_id: filters.employee_id,
        species_id: filters.species_id,
      })}`,
      "contamination-filtered-report.pdf"
    );
  };

  // Matrices
  const exportDailyMatrix = () => {
    if (!filters.date) {
      setError("Choose a date before exporting the daily matrix.");
      return Promise.resolve();
    }
    return openPdf(`/api/reports/daily-matrix/pdf?date=${encodeURIComponent(filters.date)}`, "daily-matrix-report.pdf");
  };

  const exportWeeklyMatrix = () => {
    if (!filters.date) {
      setError("Choose a date before exporting the weekly matrix.");
      return Promise.resolve();
    }

    // Safety: enforce YYYY-MM-DD from the date input
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      setError(`Invalid date format: "${filters.date}". Use YYYY-MM-DD.`);
      return Promise.resolve();
    }

    return openPdf(`/api/reports/weekly-matrix/pdf?date=${encodeURIComponent(filters.date)}`, "weekly-matrix-report.pdf");
  };

  const batchOptions = [
    {
      id: "inventory_all",
      label: "Inventory (All)",
      description: "Full inventory snapshot",
      disabled: false,
      run: exportInventoryAll,
    },
    {
      id: "inventory_active",
      label: "Inventory (Active)",
      description: "Only active items",
      disabled: false,
      run: exportInventoryActive,
    },
    {
      id: "inventory_empty",
      label: "Inventory (Empty)",
      description: "Only empty items",
      disabled: false,
      run: exportInventoryEmpty,
    },
    {
      id: "production",
      label: "Production",
      description: "General production export",
      disabled: false,
      run: exportProduction,
    },
    {
      id: "production_by_species",
      label: "Production (By Species)",
      description: "Production grouped by species",
      disabled: false,
      run: exportProductionBySpecies,
    },
    {
      id: "contamination",
      label: "Contamination",
      description: "General contamination export",
      disabled: false,
      run: exportContamination,
    },
    {
      id: "operations_filtered",
      label: "Operations (Filtered)",
      description: "Uses the general filter above",
      disabled: false,
      run: exportOperationsFiltered,
    },
    {
      id: "contamination_filtered",
      label: "Contamination (Filtered)",
      description: "Uses the general filter above",
      disabled: false,
      run: exportContaminationFiltered,
    },
    {
      id: "daily_matrix",
      label: "Daily Matrix",
      description: filters.date ? `Date: ${filters.date}` : "Requires a date",
      disabled: !filters.date,
      run: exportDailyMatrix,
    },
    {
      id: "weekly_matrix",
      label: "Weekly Matrix",
      description: filters.date ? `Date: ${filters.date}` : "Requires a date",
      disabled: !filters.date,
      run: exportWeeklyMatrix,
    },
  ];

  const setBatchOption = (id, checked) => {
    setBatchSelected((prev) => ({ ...prev, [id]: checked }));
  };

  const clearBatchSelection = () => setBatchSelected({ ...EMPTY_BATCH_SELECTION });

  const resetFilters = () =>
    setFilters({
      date: "",
      employee_id: "",
      species_id: "",
      phase: "",
    });

  const runBatchExport = async () => {
    const chosen = batchOptions.filter((o) => batchSelected[o.id]);
    setError("");
    setSuccess("");
    setShowSubscriptionAction(false);
    if (chosen.length === 0) {
      setError("Select at least one PDF to export.");
      return;
    }

    const blocked = chosen.filter((o) => o.disabled);
    if (blocked.length > 0) {
      setError(`Set required fields for: ${blocked.map((o) => o.label).join(", ")}.`);
      return;
    }

    for (const option of chosen) {
      try {
        await option.run();
      } catch {
        return;
      }
    }

    setSuccess(`Started ${chosen.length} PDF download${chosen.length > 1 ? "s" : ""}.`);
  };

  // Style helpers
	  const bigFilterSx = {
	    "& .MuiInputBase-root": { minHeight: 56 },
	    "& .MuiInputBase-input": { fontSize: 16 },
	    "& .MuiInputLabel-root": { fontSize: 15 },
	  };

  const cardSx = {
    borderRadius: 4,
    border: "1px solid rgba(0,0,0,0.07)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

  const sectionTitleSx = { fontWeight: 950, mb: 0.6 };
  const subTextSx = { opacity: 0.75, mb: 2 };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F6F8FF 0%, #FFFFFF 55%, #F7F7F7 100%)",
        py: 3,
      }}
    >
      <Container maxWidth="lg">
        {/* ===== Banner / Header ===== */}
        <Paper
          sx={{
            p: { xs: 2.2, md: 3 },
            borderRadius: 4,
            mb: 3,
            color: "#fff",
            background:
              "linear-gradient(135deg, rgba(25,118,210,1) 0%, rgba(76,175,80,1) 70%, rgba(255,193,7,0.85) 120%)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.12)",
          }}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={12}>
              <Stack direction="row" spacing={1} alignItems="center">
                <DescriptionIcon sx={{ color: "#fff" }} />
                <Typography variant="h4" sx={{ fontWeight: 1000, lineHeight: 1.1 }}>
                  Reports Dashboard
                </Typography>
              </Stack>
              <Typography sx={{ opacity: 0.92, mt: 1 }}>
                Export PDFs with filters (Inventory / Production / Contamination / Matrices).
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
                <Box
                  sx={{
                    px: 1.4,
                    py: 0.7,
                    borderRadius: 999,
                    bgcolor: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  PDF Exports
                </Box>
                <Box
                  sx={{
                    px: 1.4,
                    py: 0.7,
                    borderRadius: 999,
                    bgcolor: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Big Filters
                </Box>
                <Box
                  sx={{
                    px: 1.4,
                    py: 0.7,
                    borderRadius: 999,
                    bgcolor: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  Matrices
                </Box>
              </Stack>
            </Grid>

          </Grid>
        </Paper>

        {/* ===== General Filter ===== */}
        <Card sx={{ ...cardSx, mb: 3 }}>
          <Box sx={{ p: 1.6, bgcolor: "rgba(76,175,80,0.08)" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FilterAltIcon sx={{ color: "#166534" }} />
              <Typography variant="h6" sx={sectionTitleSx}>
                General Filter
              </Typography>
            </Stack>
            <Typography variant="body2" sx={subTextSx}>
              Date, employee, species and phase (applies to all filtered exports).
            </Typography>
          </Box>

          <CardContent>
            <Grid container spacing={2}>
	              <Grid item xs={12} md={12}>
	                <TextField
	                  label="Date"
	                  type="date"
	                  InputLabelProps={{ shrink: true }}
	                  value={filters.date}
	                  onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}
	                  fullWidth
	                  sx={bigFilterSx}
	                />
	              </Grid>
	
	              <Grid item xs={12} sm={6} md={4}>
	                <TextField
	                  select
	                  label="Employee"
	                  value={filters.employee_id}
	                  onChange={(e) => setFilters((p) => ({ ...p, employee_id: e.target.value }))}
	                  fullWidth
	                  sx={bigFilterSx}
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
	              </Grid>
	
	              <Grid item xs={12} sm={6} md={4}>
	                <TextField
	                  select
	                  label="Species"
	                  value={filters.species_id}
	                  onChange={(e) => setFilters((p) => ({ ...p, species_id: e.target.value }))}
	                  fullWidth
	                  sx={bigFilterSx}
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
	              </Grid>
	
	              <Grid item xs={12} sm={6} md={4}>
	                <TextField
	                  select
	                  label="Phase"
	                  value={filters.phase}
	                  onChange={(e) => setFilters((p) => ({ ...p, phase: e.target.value }))}
	                  fullWidth
	                  sx={bigFilterSx}
	                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  {phases.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
              <Button variant="outlined" size="large" onClick={resetFilters} fullWidth startIcon={<RestartAltIcon />}>
                Reset Filters
              </Button>
              <Button variant="outlined" size="large" onClick={clearBatchSelection} fullWidth startIcon={<ClearAllIcon />}>
                Clear Selection
              </Button>
            </Stack>

            <Typography sx={{ mt: 1.5, opacity: 0.7, fontSize: 12 }}>
              Note: Operations/Contamination filtered PDFs use the month derived from the selected date (YYYY-MM).
            </Typography>
          </CardContent>
        </Card>

        {/* ===== Batch Export ===== */}
        <Card sx={{ ...cardSx, mb: 3 }}>
          <Box sx={{ p: 1.6, bgcolor: "rgba(25,118,210,0.06)" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <DoneAllIcon sx={{ color: "#1565C0" }} />
              <Typography variant="h6" sx={sectionTitleSx}>
                Batch PDF Export
              </Typography>
            </Stack>
            <Typography variant="body2" sx={subTextSx}>
              Check what you need, then open all selected PDFs in new tabs.
            </Typography>
          </Box>

          <CardContent>
            <FormGroup>
              <Grid container spacing={1}>
                {batchOptions.map((opt) => (
                  <Grid item xs={12} sm={6} md={4} key={opt.id}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={Boolean(batchSelected[opt.id])}
                          onChange={(e) => setBatchOption(opt.id, e.target.checked)}
                          disabled={opt.disabled}
                        />
                      }
                      label={
                        <Box sx={{ py: 0.3 }}>
                          <Typography sx={{ fontWeight: 850, lineHeight: 1.2 }}>{opt.label}</Typography>
                          <Typography variant="caption" sx={{ opacity: 0.75 }}>
                            {opt.description}
                          </Typography>
                        </Box>
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            </FormGroup>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
              <Button variant="contained" size="large" onClick={runBatchExport} fullWidth startIcon={<OpenInNewIcon />}>
                Open Selected PDFs
              </Button>
              <Button variant="outlined" size="large" onClick={clearBatchSelection} fullWidth startIcon={<ClearAllIcon />}>
                Clear
              </Button>
            </Stack>

            <Typography sx={{ mt: 1.5, opacity: 0.7, fontSize: 12 }}>
              Selected reports now download directly so subscription and quota errors can be shown in-app.
            </Typography>
          </CardContent>
        </Card>

                <Box sx={{ height: 24 }} />
      </Container>
    </Box>
  );
}


