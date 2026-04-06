import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyIcon from "@mui/icons-material/Key";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createProject,
  deleteProject,
  regenerateProjectKey,
  updateProject,
} from "../api/client";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { qk } from "../lib/queryKeys";
import type { Environment, Project } from "../types";

function EnvChip({ env }: { env: Environment }) {
  return (
    <Chip
      label={env}
      size="small"
      color={env === "production" ? "error" : "primary"}
      variant={env === "production" ? "filled" : "outlined"}
      sx={{ fontWeight: 700, textTransform: "capitalize" }}
    />
  );
}

export function ProjectsPage() {
  const qc = useQueryClient();
  const { projects, refreshProjects, setSelected, selected } = useProjectWorkspace();

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; project: Project }>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState<Environment>("dev");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [regenDoneProjectId, setRegenDoneProjectId] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  const invalidateProjects = () => {
    void qc.invalidateQueries({ queryKey: qk.projects });
    void qc.invalidateQueries({ queryKey: ["logs"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (dialog?.mode === "create") {
        return createProject({ name, description, environment });
      }
      if (dialog?.mode === "edit") {
        return updateProject(dialog.project.id, { name, description, environment, isActive });
      }
      throw new Error("No dialog");
    },
    onSuccess: (updated) => {
      void invalidateProjects();
      if (selected?.id === updated.id) setSelected(updated);
      setDialog(null);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void invalidateProjects();
      setDeleteTarget(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Delete failed"),
  });

  const regenMut = useMutation({
    mutationFn: (id: string) => regenerateProjectKey(id),
    onError: (e) => setRegenError(e instanceof Error ? e.message : "Regenerate failed"),
  });

  const openCreate = () => {
    setName("");
    setDescription("");
    setEnvironment("dev");
    setIsActive(true);
    setError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (p: Project) => {
    setName(p.name);
    setDescription(p.description);
    setEnvironment(p.environment);
    setIsActive(p.isActive);
    setError(null);
    setDialog({ mode: "edit", project: p });
  };

  const closeDialog = () => {
    setDialog(null);
    setError(null);
    saveMut.reset();
  };

  const copyKey = async (p: Project) => {
    await navigator.clipboard.writeText(p.apiKey);
    setCopiedProjectId(p.id);
    window.setTimeout(() => {
      setCopiedProjectId((cur) => (cur === p.id ? null : cur));
    }, 2000);
  };

  const regen = (p: Project) => {
    if (!confirm(`Regenerate API key for "${p.name}"? The old key stops working immediately.`)) return;
    setRegenError(null);
    regenMut.mutate(p.id, {
      onSuccess: async (key) => {
        await invalidateProjects();
        await navigator.clipboard.writeText(key);
        setRegenDoneProjectId(p.id);
        window.setTimeout(() => {
          setRegenDoneProjectId((cur) => (cur === p.id ? null : cur));
        }, 2500);
      },
    });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end" flexWrap="wrap" useFlexGap>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => void refreshProjects()}
          sx={{ borderRadius: 1 }}
        >
          Refresh list
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 1 }}>
          New project
        </Button>
      </Stack>

      {regenError && (
        <Alert severity="error" onClose={() => setRegenError(null)} sx={{ borderRadius: 1 }}>
          {regenError}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Environment</TableCell>
              <TableCell>Active</TableCell>
              <TableCell>API key</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id} hover sx={{ "&:last-child td": { border: 0 } }}>
                <TableCell>
                  <Typography fontWeight={700}>{p.name}</Typography>
                  {p.description && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {p.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <EnvChip env={p.environment} />
                </TableCell>
                <TableCell>
                  <Chip
                    label={p.isActive ? "Yes" : "No"}
                    size="small"
                    color={p.isActive ? "success" : "default"}
                    variant={p.isActive ? "filled" : "outlined"}
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "ui-monospace, monospace",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.apiKey.slice(0, 14)}…
                    </Typography>
                    <Tooltip title={copiedProjectId === p.id ? "Copied" : "Copy key"}>
                      <IconButton
                        size="small"
                        onClick={() => void copyKey(p)}
                        color={copiedProjectId === p.id ? "success" : "default"}
                        aria-label={copiedProjectId === p.id ? "Copied" : "Copy API key"}
                      >
                        {copiedProjectId === p.id ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={regenDoneProjectId === p.id ? "New key copied" : "Regenerate key"}>
                    <IconButton
                      size="small"
                      color={regenDoneProjectId === p.id ? "success" : "warning"}
                      onClick={() => regen(p)}
                      disabled={regenMut.isPending}
                      aria-label="Regenerate API key"
                    >
                      {regenDoneProjectId === p.id ? <CheckIcon fontSize="small" /> : <KeyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openEdit(p)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary" align="center" py={3}>
                    No projects yet. Create one to obtain an API key.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!dialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 1 } }}>
        <DialogTitle>{dialog?.mode === "create" ? "Create project" : "Edit project"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            <FormControl fullWidth>
              <InputLabel id="env-label">Environment</InputLabel>
              <Select
                labelId="env-label"
                label="Environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as Environment)}
              >
                <MenuItem value="dev">dev</MenuItem>
                <MenuItem value="production">production</MenuItem>
              </Select>
            </FormControl>
            {dialog?.mode === "edit" && (
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                label="Project active (ingest allowed)"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || name.trim().length < 3}
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 1 } }}>
        <DialogTitle>Delete project?</DialogTitle>
        <DialogContent>
          <Typography>
            This removes <strong>{deleteTarget?.name}</strong> and related callers / logs (cascade).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            disabled={deleteMut.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
