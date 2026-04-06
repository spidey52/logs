import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useStore, shallow } from "@tanstack/react-store";
import { useEffect, useMemo, useState } from "react";
import { fetchLogDetail, listLogs } from "../api/client";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { logsFiltersKey, logsSortKey, qk } from "../lib/queryKeys";
import {
  setLogsFilters,
  setLogsSort,
  setLogsWithCount,
  type LogsSortState,
  uiStore,
} from "../store/uiStore";
import { MethodChip } from "../components/MethodChip";
import { StatusCodeChip } from "../components/StatusCodeChip";

function MsChip({ ms }: { ms: number }) {
  const color =
    ms < 120 ? ("success" as const) : ms < 400 ? ("primary" as const) : ms < 1500 ? ("warning" as const) : ("error" as const);
  return (
    <Chip
      label={`${ms} ms`}
      size="small"
      color={color}
      variant="outlined"
      sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
    />
  );
}

const SORT_COLUMNS: { id: LogsSortState["field"]; label: string }[] = [
  { id: "timestamp", label: "Time" },
  { id: "method", label: "Method" },
  { id: "status_code", label: "Status" },
  { id: "response_time_ms", label: "Duration" },
  { id: "path", label: "Path" },
  { id: "caller", label: "Caller" },
];

function defaultOrderForField(field: LogsSortState["field"]): "asc" | "desc" {
  if (field === "timestamp" || field === "status_code" || field === "response_time_ms") return "desc";
  return "asc";
}

export function LogsPage() {
  const { selected } = useProjectWorkspace();
  const applied = useStore(uiStore, (s) => s.logsFilters, shallow);
  const logsSort = useStore(uiStore, (s) => s.logsSort, shallow);
  const withCount = useStore(uiStore, (s) => s.logsWithCount);

  const [draft, setDraft] = useState(applied);
  const filtersKey = useMemo(() => logsFiltersKey(applied), [applied]);
  const sortKey = useMemo(() => logsSortKey(logsSort), [logsSort]);

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const logsQ = useInfiniteQuery({
    queryKey: selected
      ? qk.logsInfinite(selected.id, filtersKey, sortKey, withCount)
      : ["logs", "infinite", "__none", "", "", false],
    queryFn: ({ pageParam }) =>
      listLogs(selected!.apiKey, selected!.environment, {
        limit: "50",
        cursor: pageParam,
        withCount: withCount && pageParam === undefined ? "true" : undefined,
        method: applied.method.trim() || undefined,
        path: applied.path.trim() || undefined,
        search: applied.search.trim() || undefined,
        statusCode: applied.statusCode.trim() || undefined,
        sort: logsSort.field,
        order: logsSort.order,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!selected,
  });

  const rows = logsQ.data?.pages.flatMap((p) => p.data) ?? [];
  const total = logsQ.data?.pages[0]?.total ?? null;

  const [detailId, setDetailId] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: selected && detailId ? qk.logDetail(selected.id, detailId) : ["logs", "detail", "__closed"],
    queryFn: () => fetchLogDetail(selected!.apiKey, selected!.environment, detailId!),
    enabled: !!selected && !!detailId,
  });

  const applyFilters = () => {
    setLogsFilters(draft);
  };

  const requestSort = (field: LogsSortState["field"]) => {
    if (logsSort.field === field) {
      setLogsSort({ field, order: logsSort.order === "asc" ? "desc" : "asc" });
    } else {
      setLogsSort({ field, order: defaultOrderForField(field) });
    }
  };

  const openDetail = (id: string) => setDetailId(id);
  const closeDetail = () => setDetailId(null);

  const loading = logsQ.isLoading || logsQ.isFetching;
  const listErr =
    logsQ.error instanceof Error ? logsQ.error.message : logsQ.error ? String(logsQ.error) : null;

  return (
    <Stack spacing={2}>
      {!selected && (
        <Alert severity="info" sx={{ borderRadius: 1 }}>
          Choose a project in the top bar to load logs (uses that project&apos;s API key).
        </Alert>
      )}
      {listErr && (
        <Alert severity="error" onClose={() => logsQ.refetch()}>
          {listErr}
        </Alert>
      )}

      {selected && (
        <Paper sx={{ p: 1.5, borderRadius: 1 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} flexWrap="wrap" useFlexGap alignItems={{ md: "center" }}>
              <TextField
                size="small"
                label="Method"
                value={draft.method}
                onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))}
                placeholder="GET"
                sx={{ minWidth: 120 }}
              />
              <TextField
                size="small"
                label="Path contains"
                value={draft.path}
                onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                size="small"
                label="Search"
                value={draft.search}
                onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                placeholder="path, IP, UA…"
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                size="small"
                label="Status"
                value={draft.statusCode}
                onChange={(e) => setDraft((d) => ({ ...d, statusCode: e.target.value }))}
                placeholder="200 or 400-499"
                sx={{ minWidth: 140 }}
              />
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ ml: { md: "auto" } }}
              >
                <Button size="small" variant="outlined" onClick={() => setLogsWithCount(!withCount)}>
                  Match count: {withCount ? "on" : "off"}
                </Button>
                {withCount && (
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    {loading && total == null
                      ? "…"
                      : total != null
                        ? `Matching ${total.toLocaleString()}`
                        : "—"}
                  </Typography>
                )}
              </Stack>
              <Button
                variant="contained"
                onClick={applyFilters}
                disabled={loading}
                sx={{ borderRadius: 1, height: 36 }}
              >
                Apply
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ borderRadius: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {SORT_COLUMNS.map((col) => (
                <TableCell key={col.id} sortDirection={logsSort.field === col.id ? logsSort.order : false}>
                  <TableSortLabel
                    active={logsSort.field === col.id}
                    direction={logsSort.field === col.id ? logsSort.order : "asc"}
                    onClick={(e) => {
                      e.stopPropagation();
                      requestSort(col.id);
                    }}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                hover
                onClick={() => openDetail(r.id)}
                sx={{ cursor: "pointer", "&:hover": { bgcolor: alpha("#1d4ed8", 0.04) } }}
              >
                <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {new Date(r.timestamp).toLocaleString()}
                </TableCell>
                <TableCell>
                  <MethodChip method={r.method} />
                </TableCell>
                <TableCell>
                  <StatusCodeChip code={r.statusCode} />
                </TableCell>
                <TableCell>
                  <MsChip ms={r.responseTimeMs} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                    {r.path}
                  </Typography>
                </TableCell>
                <TableCell>
                  {r.caller ? (
                    <Chip label={r.caller.name} size="small" color="secondary" variant="outlined" />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {selected && !loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography align="center" color="text.secondary" py={3}>
                    No logs for these filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && (
        <Box display="flex" justifyContent="center">
          <CircularProgress size={32} />
        </Box>
      )}

      {logsQ.hasNextPage && (
        <Button
          variant="outlined"
          onClick={() => logsQ.fetchNextPage()}
          disabled={logsQ.isFetchingNextPage}
          sx={{ alignSelf: "center" }}
        >
          {logsQ.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}

      <Drawer
        anchor="right"
        open={detailId != null}
        onClose={closeDetail}
        PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, borderRadius: "6px 0 0 6px" } }}
      >
        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 800 }}>
            Log detail
          </Typography>
          <IconButton onClick={closeDetail} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Box sx={{ p: 2, overflow: "auto" }}>
          {detailQ.isLoading && (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          )}
          {detailQ.isError && (
            <Alert severity="error">
              {detailQ.error instanceof Error ? detailQ.error.message : "Failed to load detail"}
            </Alert>
          )}
          {detailQ.isSuccess && detailQ.data && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <MethodChip method={detailQ.data.log.method} />
                <StatusCodeChip code={detailQ.data.log.statusCode} />
                <MsChip ms={detailQ.data.log.responseTimeMs} />
              </Stack>
              <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                {detailQ.data.log.path}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                JSON
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  borderRadius: 1,
                  bgcolor: alpha("#0f172a", 0.04),
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: "70vh",
                }}
              >
                {JSON.stringify(detailQ.data, null, 2)}
              </Box>
            </Stack>
          )}
        </Box>
      </Drawer>
    </Stack>
  );
}
