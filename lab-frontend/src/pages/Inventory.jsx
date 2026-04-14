import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import AddIcon from "@mui/icons-material/Add";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  InputAdornment,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import SubscriptionAlertAction from "../components/SubscriptionAlertAction";
import { downloadPdf } from "../utils/pdfDownload";
import { getFriendlyApiError, hasSubscriptionResolution } from "../utils/subscriptionErrors";

export default function Inventory() {
  const phaseOptions = ["Initiation", "Multiplication", "Rooting", "Acclimatization", "Other"];
  const [species, setSpecies] = useState([]);
  const [rows, setRows] = useState([]);

  // filters
  const [filters, setFilters] = useState({
    species_id: "",
    phase: "",
    status: "all", // all | active | empty
    search: "",
  });

  // add dialog
  const [openAdd, setOpenAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  // edit dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErrMsg, setEditErrMsg] = useState("");

  const [addForm, setAddForm] = useState({
    species_id: "",
    phase_of_culture: "Multiplication",
    subculture_mother_jars: "",
    number_mother_jar: "",
  });

  const fetchAll = async () => {
    const sp = await api.get("/species");
    setSpecies(sp.data || []);

    const inv = await api.get("/inventory");
    setRows(inv.data || []);
  };

  useEffect(() => {
    fetchAll().catch(() => {});
  }, []);

  // --------- derived list (filters on frontend)
  const filteredRows = useMemo(() => {
    let data = [...rows];

    // species filter
    if (filters.species_id) {
      data = data.filter((r) => Number(r.species_id) === Number(filters.species_id));
    }

    if (filters.phase) {
      data = data.filter((r) => String(r.phase_of_culture || "") === filters.phase);
    }

    // status filter
    if (filters.status === "active") {
      data = data.filter((r) => Number(r.number_mother_jar) > 0);
    } else if (filters.status === "empty") {
      data = data.filter((r) => Number(r.number_mother_jar) === 0);
    }

    // search (species name OR id OR subculture)
    const q = (filters.search || "").trim().toLowerCase();
    if (q) {
      data = data.filter((r) => {
        const sp = String(r.species_name || "").toLowerCase();
        const id = String(r.id || "");
        const phase = String(r.phase_of_culture || "").toLowerCase();
        const sub = String(r.subculture_mother_jars ?? "");
        return sp.includes(q) || id.includes(q) || phase.includes(q) || sub.includes(q);
      });
    }

    // sort
    data.sort((a, b) => {
      const s1 = String(a.species_name || "");
      const s2 = String(b.species_name || "");
      if (s1 !== s2) return s1.localeCompare(s2);
      const p1 = String(a.phase_of_culture || "");
      const p2 = String(b.phase_of_culture || "");
      if (p1 !== p2) return p1.localeCompare(p2);
      return Number(a.subculture_mother_jars) - Number(b.subculture_mother_jars);
    });

    return data;
  }, [rows, filters]);

  const resetFilters = () => {
    setFilters({ species_id: "", phase: "", status: "all", search: "" });
  };

  // --------- add inventory
  const openDialog = () => {
    setErrMsg("");
    setAddForm({
      species_id: "",
      phase_of_culture: "Multiplication",
      subculture_mother_jars: "",
      number_mother_jar: "",
    });
    setOpenAdd(true);
  };

  const closeDialog = () => setOpenAdd(false);

  const canSave =
    addForm.species_id &&
    addForm.phase_of_culture &&
    (addForm.phase_of_culture !== "Multiplication" || addForm.subculture_mother_jars !== "") &&
    addForm.number_mother_jar !== "";

  const submitAdd = async () => {
    try {
      setSaving(true);
      setErrMsg("");
      setShowSubscriptionAction(false);

      await api.post("/inventory", {
        species_id: Number(addForm.species_id),
        phase_of_culture: addForm.phase_of_culture,
        subculture_mother_jars:
          addForm.subculture_mother_jars === ""
            ? undefined
            : Number(addForm.subculture_mother_jars),
        number_mother_jar: Number(addForm.number_mother_jar),
      });

      setOpenAdd(false);
      await fetchAll();
    } catch (err) {
      setShowSubscriptionAction(hasSubscriptionResolution(err));
      setErrMsg(getFriendlyApiError(err, "save inventory"));
    } finally {
      setSaving(false);
    }
  };

  // --------- edit mother jars count
  const openEditDialog = (row) => {
    setEditErrMsg("");
    setEditRow(row);
    setEditValue(String(row?.number_mother_jar ?? 0));
    setOpenEdit(true);
  };

  const closeEditDialog = () => setOpenEdit(false);

  const canSaveEdit =
    !!editRow && editValue !== "" && Number.isFinite(Number(editValue)) && Number(editValue) >= 0;

  const submitEdit = async () => {
    try {
      if (!editRow) return;

      setSavingEdit(true);
      setEditErrMsg("");
      setShowSubscriptionAction(false);

      await api.put(`/inventory/${editRow.id}`, {
        number_mother_jar: Number(editValue),
      });

      setOpenEdit(false);
      await fetchAll();
    } catch (err) {
      setShowSubscriptionAction(hasSubscriptionResolution(err));
      setEditErrMsg(getFriendlyApiError(err, "update inventory"));
    } finally {
      setSavingEdit(false);
    }
  };

  // --------- pdf helpers
  const openPdf = async (path, fallbackName) => {
    try {
      setErrMsg("");
      setShowSubscriptionAction(false);
      await downloadPdf(path.replace(/^\/api/, ''), fallbackName);
    } catch (err) {
      setShowSubscriptionAction(hasSubscriptionResolution(err));
      setErrMsg(getFriendlyApiError(err, "export a PDF"));
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1200, mx: "auto", mt: 3, px: 2 }}>
      {/* HEADER */}
      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Inventory2Icon sx={{ color: "#166534" }} />
              <Typography variant="h5" fontWeight={900}>
                Inventory
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ opacity: 0.75, mt: 0.5 }}>
              Manage stock by species, phase, and subculture.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button variant="contained" onClick={openDialog} size="large" startIcon={<AddIcon />}>
              Add Inventory
            </Button>

            <Button
              variant="outlined"
              onClick={() => openPdf("/api/reports/inventory/pdf", "inventory-report.pdf")}
              size="large"
              startIcon={<PictureAsPdfIcon />}
            >
              Export PDF (All)
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* FILTERS + PDF Buttons */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={900} gutterBottom>
          Filters
        </Typography>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
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

          <TextField
            select
            label="Phase"
            value={filters.phase}
            onChange={(e) => setFilters({ ...filters, phase: e.target.value })}
            fullWidth
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {phaseOptions.map((phase) => (
              <MenuItem key={phase} value={phase}>
                {phase}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            fullWidth
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active (&gt; 0)</MenuItem>
            <MenuItem value="empty">Empty (= 0)</MenuItem>
          </TextField>

          <TextField
            label="Search (species / id / subculture)"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ opacity: 0.65 }} />
                </InputAdornment>
              )
            }}
            fullWidth
          />

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" onClick={resetFilters} startIcon={<RestartAltIcon />}>
              Reset
            </Button>

            {/* ✅ PDF حسب status */}
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                const q = new URLSearchParams();
                if (filters.species_id) q.append("species_id", filters.species_id);
                if (filters.status !== "all") q.append("view", filters.status);
                openPdf(`/api/reports/inventory/pdf?${q.toString()}`, "inventory-report.pdf");
              }}
              startIcon={<PictureAsPdfIcon />}
            >
              PDF
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* COUNTERS */}
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
          <Chip label={`All: ${rows.length}`} />
          <Chip label={`Shown: ${filteredRows.length}`} color="primary" />
          <Chip
            label={`Active: ${rows.filter((r) => Number(r.number_mother_jar) > 0).length}`}
            color="success"
            variant="outlined"
          />
          <Chip
            label={`Empty: ${rows.filter((r) => Number(r.number_mother_jar) === 0).length}`}
            color="warning"
            variant="outlined"
          />
        </Stack>

        {/* TABLE */}
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Species</TableCell>
              <TableCell>Phase</TableCell>
              <TableCell align="left">Subculture</TableCell>
              <TableCell align="left">Mother Jars</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ opacity: 0.7 }}>
                  No inventory found for these filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => {
                const jars = Number(r.number_mother_jar) || 0;
                const isEmpty = jars === 0;

                return (
                  <TableRow
                    key={r.id}
                    sx={
                      isEmpty
                        ? { bgcolor: "rgba(244, 67, 54, 0.10)" }
                        : undefined
                    }
                  >
                    <TableCell>{r.id}</TableCell>
                    <TableCell>{r.species_name}</TableCell>
                    <TableCell>{r.phase_of_culture || "-"}</TableCell>
                    <TableCell align="left">{r.subculture_mother_jars}</TableCell>
                    <TableCell align="left">{jars}</TableCell>
                    <TableCell>
                      {isEmpty ? (
                        <Chip size="small" label="EMPTY" color="warning" />
                      ) : (
                        <Chip size="small" label="ACTIVE" color="success" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => openEditDialog(r)}
                        startIcon={<EditIcon />}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ADD INVENTORY DIALOG */}
      <Dialog open={openAdd} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Add Inventory</DialogTitle>

        <DialogContent dividers>
          {errMsg && (
            <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>
              {errMsg}
            </Alert>
          )}

          <Stack spacing={2}>
            <TextField
              select
              label="Species"
              value={addForm.species_id}
              onChange={(e) => setAddForm({ ...addForm, species_id: e.target.value })}
              fullWidth
            >
              <MenuItem value="">
                <em>Select</em>
              </MenuItem>
              {species.map((sp) => (
                <MenuItem key={sp.id} value={sp.id}>
                  {sp.species_name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Phase"
              value={addForm.phase_of_culture}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  phase_of_culture: e.target.value,
                  subculture_mother_jars:
                    e.target.value === "Multiplication" ? addForm.subculture_mother_jars : "",
                })
              }
              fullWidth
            >
              {phaseOptions.map((phase) => (
                <MenuItem key={phase} value={phase}>
                  {phase}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Mother Subculture (subculture_mother_jars)"
              type="number"
              inputProps={{ min: 0 }}
              value={addForm.subculture_mother_jars}
              onChange={(e) =>
                setAddForm({ ...addForm, subculture_mother_jars: e.target.value })
              }
              helperText={
                addForm.phase_of_culture === "Multiplication"
                  ? "Required for Multiplication inventory."
                  : "Fixed to 0 for non-Multiplication inventory."
              }
              disabled={addForm.phase_of_culture !== "Multiplication"}
              fullWidth
            />

            <TextField
              label="Mother Jars Count (number_mother_jar)"
              type="number"
              inputProps={{ min: 0 }}
              value={addForm.number_mother_jar}
              onChange={(e) =>
                setAddForm({ ...addForm, number_mother_jar: e.target.value })
              }
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDialog} disabled={saving} startIcon={<CloseIcon />}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitAdd}
            disabled={!canSave || saving}
            startIcon={<SaveIcon />}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* EDIT INVENTORY DIALOG */}
      <Dialog open={openEdit} onClose={closeEditDialog} fullWidth maxWidth="sm">
        <DialogTitle>Edit Mother Jars</DialogTitle>

        <DialogContent dividers>
          {editErrMsg && (
            <Alert severity="error" sx={{ mb: 2 }} action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>
              {editErrMsg}
            </Alert>
          )}

          <Stack spacing={2}>
            <TextField
              label="Inventory"
              value={
                editRow
                  ? `ID ${editRow.id} — ${editRow.species_name} — Sub ${editRow.subculture_mother_jars}`
                  : ""
              }
              fullWidth
              InputProps={{ readOnly: true }}
            />

            <TextField
              label="Mother Jars Count (number_mother_jar)"
              type="number"
              inputProps={{ min: 0 }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeEditDialog} disabled={savingEdit} startIcon={<CloseIcon />}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitEdit}
            disabled={!canSaveEdit || savingEdit}
            startIcon={<SaveIcon />}
          >
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
