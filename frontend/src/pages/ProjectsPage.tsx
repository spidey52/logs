import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyIcon from "@mui/icons-material/Key";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
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
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  createProject,
  deleteProject,
  regenerateProjectKey,
  updateProject,
} from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { PageHeader } from "../components/PageHeader";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { qk } from "../lib/queryKeys";
import { toast } from "../store/toastStore";
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [regenDoneProjectId, setRegenDoneProjectId] = useState<string | null>(null);

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
      toast.success(dialog?.mode === "create" ? "Project created" : "Project updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void invalidateProjects();
      setDeleteTarget(null);
      toast.success("Project deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const regenMut = useMutation({
    mutationFn: (id: string) => regenerateProjectKey(id),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Regenerate failed"),
  });

  const openCreate = () => {
    setName("");
    setDescription("");
    setEnvironment("dev");
    setIsActive(true);
    setDialog({ mode: "create" });
  };

  const openEdit = (p: Project) => {
    setName(p.name);
    setDescription(p.description);
    setEnvironment(p.environment);
    setIsActive(p.isActive);
    setDialog({ mode: "edit", project: p });
  };

  const closeDialog = () => {
    setDialog(null);
    saveMut.reset();
  };

  const copyKey = async (p: Project) => {
    await navigator.clipboard.writeText(p.apiKey);
    setCopiedProjectId(p.id);
    toast.success("API key copied");
    window.setTimeout(() => {
      setCopiedProjectId((cur) => (cur === p.id ? null : cur));
    }, 2000);
  };

  const regen = (p: Project) => {
    if (!confirm(`Regenerate API key for "${p.name}"? The old key stops working immediately.`)) return;
    regenMut.mutate(p.id, {
      onSuccess: async (key) => {
        await invalidateProjects();
        await navigator.clipboard.writeText(key);
        setRegenDoneProjectId(p.id);
        toast.success("New API key generated and copied");
        window.setTimeout(() => {
          setRegenDoneProjectId((cur) => (cur === p.id ? null : cur));
        }, 2500);
      },
    });
  };

  const columns = useMemo<GridColDef<Project>[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1.2,
        minWidth: 180,
        renderCell: (params) => (
          <Stack spacing={0.25} sx={{ py: 0.5, overflow: "hidden" }}>
            <Typography fontWeight={700} variant="body2" noWrap>
              {params.row.name}
            </Typography>
            {params.row.description ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {params.row.description}
              </Typography>
            ) : null}
          </Stack>
        ),
      },
      {
        field: "environment",
        headerName: "Environment",
        width: 130,
        renderCell: (params) => <EnvChip env={params.value} />,
      },
      {
        field: "isActive",
        headerName: "Active",
        width: 100,
        renderCell: (params) => (
          <Chip
            label={params.value ? "Yes" : "No"}
            size="small"
            color={params.value ? "success" : "default"}
            variant={params.value ? "filled" : "outlined"}
          />
        ),
      },
      {
        field: "apiKey",
        headerName: "API key",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: (params) => (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ overflow: "hidden" }}>
            <Typography
              variant="caption"
              sx={{
                fontFamily: "ui-monospace, monospace",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {params.row.apiKey.slice(0, 14)}…
            </Typography>
            <Tooltip title={copiedProjectId === params.row.id ? "Copied" : "Copy key"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyKey(params.row);
                }}
                color={copiedProjectId === params.row.id ? "success" : "default"}
                aria-label={copiedProjectId === params.row.id ? "Copied" : "Copy API key"}
              >
                {copiedProjectId === params.row.id ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 140,
        sortable: false,
        filterable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => (
          <Stack direction="row" spacing={0.25} justifyContent="flex-end" sx={{ width: "100%" }}>
            <Tooltip title={regenDoneProjectId === params.row.id ? "New key copied" : "Regenerate key"}>
              <IconButton
                size="small"
                color={regenDoneProjectId === params.row.id ? "success" : "warning"}
                onClick={(e) => {
                  e.stopPropagation();
                  regen(params.row);
                }}
                disabled={regenMut.isPending}
                aria-label="Regenerate API key"
              >
                {regenDoneProjectId === params.row.id ? <CheckIcon fontSize="small" /> : <KeyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(params.row);
                }}
              >
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(params.row);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [copiedProjectId, regenDoneProjectId, regenMut.isPending],
  );

  return (
    <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <PageHeader title="Projects">
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
      </PageHeader>

      <DataGridTable
        rows={projects}
        columns={columns}
        emptyMessage="No projects yet. Create one to obtain an API key."
        pageSizeOptions={[25, 50]}
        hideFooter={projects.length === 0}
      />

      <Dialog open={!!dialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 1 } }}>
        <DialogTitle>{dialog?.mode === "create" ? "Create project" : "Edit project"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
