import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
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
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteCaller, listCallers, updateCaller } from "../api/client";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { qk } from "../lib/queryKeys";
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
  const [formError, setFormError] = useState<string | null>(null);

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
      setFormError(null);
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCaller(id),
    onSuccess: () => void invalidateCallers(),
    onError: (e) => setFormError(e instanceof Error ? e.message : "Delete failed"),
  });

  const openEdit = (row: Caller) => {
    setName(row.name);
    setEmail(row.email ?? "");
    setFormError(null);
    setEditRow(row);
  };

  const remove = (row: Caller) => {
    if (!confirm(`Delete caller "${row.name}"?`)) return;
    deleteMut.mutate(row.id);
  };

  const loading = listQ.isLoading || listQ.isFetching;
  const listErr =
    listQ.error instanceof Error ? listQ.error.message : listQ.error ? String(listQ.error) : null;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Callers are created when your SDK sends a caller identifier with requests. You can edit display details or remove
        stale rows here — there is no manual &quot;add caller&quot; flow.
      </Typography>

      {!selected && (
        <Alert severity="info" sx={{ borderRadius: 1 }}>
          Choose a project in the top bar to list callers for that project.
        </Alert>
      )}
      {listErr && (
        <Alert severity="error" onClose={() => listQ.refetch()} sx={{ borderRadius: 1 }}>
          {listErr}
        </Alert>
      )}
      {formError && (
        <Alert severity="error" onClose={() => setFormError(null)} sx={{ borderRadius: 1 }}>
          {formError}
        </Alert>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Identifier</TableCell>
              <TableCell>Email</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Typography fontWeight={600} variant="body2">
                    {r.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace" }}>
                    {r.identifier}
                  </Typography>
                </TableCell>
                <TableCell>{r.email ?? "—"}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openEdit(r)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => remove(r)} disabled={deleteMut.isPending}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {selected && !loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography align="center" color="text.secondary" py={3} variant="body2">
                    No callers yet — they appear when traffic includes caller metadata.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
          setFormError(null);
          saveMut.reset();
        }}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 1 } }}
      >
        <DialogTitle>Edit caller</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
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
          <Button
            onClick={() => {
              setEditRow(null);
              setFormError(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
