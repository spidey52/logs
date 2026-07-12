import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { GridColDef } from "@mui/x-data-grid";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { deleteCaller, listCallers, updateCaller } from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { PageHeader } from "../components/PageHeader";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { qk } from "../lib/queryKeys";
import { toast } from "../store/toastStore";
import type { Caller } from "../types";

export function UsersPage() {
  const qc = useQueryClient();
  const { selected } = useProjectWorkspace();

  const invalidateCallers = () => qc.invalidateQueries({ queryKey: ["callers"] });

  const listQ = useInfiniteQuery({
    queryKey: selected ? qk.callersInfinite(selected.id) : ["callers", "infinite", "__none"],
    queryFn: ({ pageParam }) =>
      listCallers({
        projectId: selected!.id,
        limit: 40,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!selected,
  });

  const rows = listQ.data?.pages.flatMap((p) => p.data) ?? [];

  const [editRow, setEditRow] = useState<Caller | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editRow) throw new Error("No row");
      return updateCaller(editRow.id, {
        name,
        identifier: editRow.identifier,
        email: email.trim() || null,
        metadata: editRow.metadata,
      });
    },
    onSuccess: () => {
      void invalidateCallers();
      setEditRow(null);
      toast.success("Caller updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCaller(id),
    onSuccess: () => {
      void invalidateCallers();
      toast.success("Caller deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openEdit = (row: Caller) => {
    setName(row.name);
    setEmail(row.email ?? "");
    setEditRow(row);
  };

  const remove = (row: Caller) => {
    if (!confirm(`Delete caller "${row.name}"?`)) return;
    deleteMut.mutate(row.id);
  };

  const columns = useMemo<GridColDef<Caller>[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        minWidth: 160,
        renderCell: (params) => (
          <Typography fontWeight={600} variant="body2">
            {params.value}
          </Typography>
        ),
      },
      {
        field: "identifier",
        headerName: "Identifier",
        flex: 1,
        minWidth: 180,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace" }}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: "email",
        headerName: "Email",
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.email ?? "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 110,
        sortable: false,
        filterable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ width: "100%" }}>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => openEdit(params.row)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => remove(params.row)} disabled={deleteMut.isPending}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [deleteMut.isPending],
  );

  const listErr =
    listQ.error instanceof Error ? listQ.error.message : listQ.error ? String(listQ.error) : null;

  useToastOnChange(listErr, "error");

  return (
    <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <PageHeader title="Callers" />
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        Callers are created when your SDK sends a caller identifier with requests. You can edit display details or remove
        stale rows here — there is no manual &quot;add caller&quot; flow.
      </Typography>

      {!selected && (
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          Choose a project in the top bar to list callers for that project.
        </Typography>
      )}

      <DataGridTable
        rows={rows}
        columns={columns}
        loading={listQ.isFetching}
        emptyMessage={
          selected
            ? "No callers yet — they appear when traffic includes caller metadata."
            : "Choose a project to list callers."
        }
        pageSizeOptions={[40, 80]}
        hideFooter={!selected || rows.length === 0}
      />

      {listQ.hasNextPage && (
        <Button
          variant="outlined"
          onClick={() => listQ.fetchNextPage()}
          disabled={listQ.isFetchingNextPage}
          sx={{ alignSelf: "center" }}
        >
          {listQ.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}

      <Dialog
        open={!!editRow}
        onClose={() => {
          setEditRow(null);
          saveMut.reset();
        }}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 1 } }}
      >
        <DialogTitle>Edit caller</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
            <TextField
              label="Identifier"
              value={editRow?.identifier ?? ""}
              fullWidth
              disabled
              helperText="Set by the client SDK when logging requests"
            />
            <TextField label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth type="email" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditRow(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
