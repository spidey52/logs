import RefreshIcon from "@mui/icons-material/Refresh";
import { Button, Chip, Stack, TextField, Typography } from "@mui/material";
import type { GridColDef, GridSortModel } from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { shallow, useStore } from "@tanstack/react-store";
import moment from "moment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLogDetail, listCallers, listLogs } from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { FlexibleDatePicker, type DateRangeValue } from "../components/FlexibleDatePicker";
import { LogDetailDialog } from "../components/LogDetailDialog";
import { MethodChip } from "../components/MethodChip";
import { MultiSelect, type MultiSelectGroup, type MultiSelectOption } from "../components/MultiSelect";
import { PageHeader } from "../components/PageHeader";
import { StatusCodeChip } from "../components/StatusCodeChip";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { logsFiltersKey, logsSortKey, PAGE_SIZE, qk } from "../lib/queryKeys";
import { LOG_METHOD_OPTIONS, patchLogsFilters, setLogsSort, uiStore, type LogSearchField, type LogsSortState } from "../store/uiStore";
import type { ApiLog, Caller } from "../types";

const METHOD_OPTIONS: MultiSelectOption[] = LOG_METHOD_OPTIONS.map((m) => ({
 value: m,
 label: m,
}));

const SEARCH_FIELD_GROUPS: MultiSelectGroup<LogSearchField>[] = [
 {
  id: "request",
  label: "Request",
  options: [
   { value: "path", label: "Path" },
   { value: "host", label: "Host" },
   { value: "userAgent", label: "User agent" },
   { value: "error", label: "Error" },
  ],
 },
 {
  id: "identity",
  label: "Identity",
  options: [
   { value: "ip", label: "IP address" },
   { value: "service", label: "Service" },
  ],
 },
 {
  id: "tracing",
  label: "Tracing",
  options: [
   { value: "requestId", label: "Request ID" },
   { value: "traceId", label: "Trace ID" },
  ],
 },
];

function MsChip({ ms }: { ms: number }) {
 const color = ms < 120 ? ("success" as const) : ms < 400 ? ("primary" as const) : ms < 1500 ? ("warning" as const) : ("error" as const);
 return <Chip label={`${ms} ms`} size='small' color={color} variant='outlined' sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />;
}

const STATUS_CODE_GROUPS: MultiSelectGroup[] = [
 {
  id: "info",
  label: "Informational",
  options: [
   { value: "100", label: "100 Continue" },
   { value: "101", label: "101 Switching Protocols" },
  ],
 },
 {
  id: "success",
  label: "Good request",
  options: [
   { value: "200", label: "200 OK" },
   { value: "201", label: "201 Created" },
   { value: "202", label: "202 Accepted" },
   { value: "204", label: "204 No Content" },
  ],
 },
 {
  id: "redirect",
  label: "Redirect",
  options: [
   { value: "301", label: "301 Moved Permanently" },
   { value: "302", label: "302 Found" },
   { value: "304", label: "304 Not Modified" },
   { value: "307", label: "307 Temporary Redirect" },
  ],
 },
 {
  id: "client",
  label: "Bad request",
  options: [
   { value: "400", label: "400 Bad Request" },
   { value: "401", label: "401 Unauthorized" },
   { value: "403", label: "403 Forbidden" },
   { value: "404", label: "404 Not Found" },
   { value: "405", label: "405 Method Not Allowed" },
   { value: "409", label: "409 Conflict" },
   { value: "422", label: "422 Unprocessable Entity" },
   { value: "429", label: "429 Too Many Requests" },
  ],
 },
 {
  id: "server",
  label: "Server error",
  options: [
   { value: "500", label: "500 Internal Server Error" },
   { value: "502", label: "502 Bad Gateway" },
   { value: "503", label: "503 Service Unavailable" },
   { value: "504", label: "504 Gateway Timeout" },
  ],
 },
];

function defaultOrderForField(field: LogsSortState["field"]): "asc" | "desc" {
 if (field === "timestamp" || field === "status_code" || field === "response_time_ms") return "desc";
 return "asc";
}

function useDebouncedValue<T>(value: T, ms: number): T {
 const [v, setV] = useState(value);
 useEffect(() => {
  const t = window.setTimeout(() => setV(value), ms);
  return () => window.clearTimeout(t);
 }, [value, ms]);
 return v;
}

const SORTABLE_FIELDS = new Set<LogsSortState["field"]>(["caller", "path", "status_code", "method", "response_time_ms", "timestamp"]);

export function LogsPage() {
 const { selected } = useProjectWorkspace();
 const filters = useStore(uiStore, (s) => s.logsFilters, shallow);
 const logsSort = useStore(uiStore, (s) => s.logsSort, shallow);

 const [searchInput, setSearchInput] = useState(filters.search);
 const debouncedSearch = useDebouncedValue(searchInput, 300);

 const [page, setPage] = useState(0);
 const filtersKey = useMemo(() => logsFiltersKey(filters), [filters]);
 const sortKey = useMemo(() => logsSortKey(logsSort), [logsSort]);
 const offset = page * PAGE_SIZE;

 useEffect(() => {
  setSearchInput(filters.search);
 }, [filters.search]);

 useEffect(() => {
  if (debouncedSearch === filters.search) return;
  patchLogsFilters({ search: debouncedSearch });
 }, [debouncedSearch, filters.search]);

 useEffect(() => {
  setPage(0);
 }, [filtersKey, sortKey, selected?.id]);

 const callersById = useRef(new Map<string, Caller>());
 useEffect(() => {
  for (const c of filters.callerPicks) callersById.current.set(c.id, c);
 }, [filters.callerPicks]);

 const callerIds = useMemo(() => filters.callerPicks.map((c) => c.id), [filters.callerPicks]);
 const callerSelectedOptions = useMemo(
  () =>
   filters.callerPicks.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.identifier,
   })),
  [filters.callerPicks],
 );
 const statusValues = useMemo(() => filters.statusCodes.map(String), [filters.statusCodes]);

 const loadCallerOptions = useCallback(
  async (query: string): Promise<MultiSelectOption[]> => {
   if (!selected) return [];
   const { data } = await listCallers({
    projectId: selected.id,
    limit: 40,
    search: query.trim() || undefined,
   });
   for (const c of data) callersById.current.set(c.id, c);
   return data.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.identifier,
   }));
  },
  [selected],
 );

 /** Avoid COUNT(*) OVER() on every page flip — only count when filters/sort change. */
 const totalsCache = useRef(new Map<string, number>());
 const totalKey = `${selected?.id ?? ""}|${filtersKey}|${sortKey}`;

 const logsQ = useQuery({
  queryKey: selected ? qk.logsPage(selected.id, filtersKey, sortKey, offset) : ["logs", "page", "__none"],
  queryFn: async () => {
   const needCount = !totalsCache.current.has(totalKey);
   const res = await listLogs(selected!.apiKey, selected!.environment, {
    limit: PAGE_SIZE,
    offset,
    withCount: needCount ? 1 : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    methods: filters.methods.length ? filters.methods.join(",") : undefined,
    search: filters.search.trim() || undefined,
    searchFields: filters.search.trim() && filters.searchFields.length ? filters.searchFields.join(",") : undefined,
    statusCodes: filters.statusCodes.length ? [...filters.statusCodes].sort((a, b) => a - b).join(",") : undefined,
    callerIds: filters.callerPicks.length ? filters.callerPicks.map((c) => c.id).join(",") : undefined,
    sort: logsSort.field,
    order: logsSort.order,
   });
   if (typeof res.total === "number") totalsCache.current.set(totalKey, res.total);
   return {
    ...res,
    total: res.total ?? totalsCache.current.get(totalKey) ?? 0,
   };
  },
  enabled: !!selected,
  // Only keep previous page while flipping pages — never across filter/sort changes
  // (otherwise old rows linger with no spinner and filters look broken).
  placeholderData: (previousData, previousQuery) => {
   const prevKey = previousQuery?.queryKey;
   if (!prevKey || !selected) return undefined;
   const prevFilters = prevKey[3];
   const prevSort = prevKey[4];
   if (prevFilters === filtersKey && prevSort === sortKey) return previousData;
   return undefined;
  },
 });

 const rows = logsQ.data?.data ?? [];
 const total = logsQ.data?.total ?? totalsCache.current.get(totalKey) ?? 0;
 const gridLoading = logsQ.isPending || logsQ.isFetching;

 useEffect(() => {
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  if (page > maxPage) setPage(maxPage);
 }, [total, page]);

 const [detailId, setDetailId] = useState<string | null>(null);

 const detailQ = useQuery({
  queryKey: selected && detailId ? qk.logDetail(selected.id, detailId) : ["logs", "detail", "__closed"],
  queryFn: () => fetchLogDetail(selected!.apiKey, selected!.environment, detailId!),
  enabled: !!selected && !!detailId,
 });

 const sortModel: GridSortModel = [{ field: logsSort.field, sort: logsSort.order }];

 const onSortModelChange = (model: GridSortModel) => {
  const next = model[0];
  if (!next?.field || !SORTABLE_FIELDS.has(next.field as LogsSortState["field"])) {
   setLogsSort({ field: "timestamp", order: "desc" });
   return;
  }
  const field = next.field as LogsSortState["field"];
  const order = (next.sort ?? defaultOrderForField(field)) as "asc" | "desc";
  setLogsSort({ field, order });
 };

 const columns = useMemo<GridColDef<ApiLog>[]>(
  () => [
   {
    field: "index",
    headerName: "#",
    width: 56,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    valueGetter: (_v, row) => {
     const idx = rows.findIndex((r) => r.id === row.id);
     return idx >= 0 ? offset + idx + 1 : "";
    },
    cellClassName: "mono-muted",
   },
   {
    field: "caller",
    headerName: "Caller",
    flex: 1,
    minWidth: 140,
    valueGetter: (_v, row) => row.caller?.name ?? "",
    renderCell: (params) =>
     params.row.caller ? (
      <Chip label={params.row.caller.name} size='small' color='secondary' variant='outlined' />
     ) : (
      <Typography variant='caption' color='text.secondary'>
       —
      </Typography>
     ),
   },
   {
    field: "path",
    headerName: "Path",
    flex: 2,
    minWidth: 200,
    renderCell: (params) => (
     <Typography variant='body2' sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
      {params.value}
     </Typography>
    ),
   },
   {
    field: "status_code",
    headerName: "Status",
    width: 100,
    valueGetter: (_v, row) => row.statusCode,
    renderCell: (params) => <StatusCodeChip code={params.row.statusCode} />,
   },
   {
    field: "method",
    headerName: "Method",
    width: 100,
    renderCell: (params) => <MethodChip method={params.value} />,
   },
   {
    field: "response_time_ms",
    headerName: "Duration",
    width: 110,
    valueGetter: (_v, row) => row.responseTimeMs,
    renderCell: (params) => <MsChip ms={params.row.responseTimeMs} />,
   },
   {
    field: "timestamp",
    headerName: "Time",
    width: 200,
    valueGetter: (_v, row) => row.timestamp,
    renderCell: (params) => (
     <Typography variant='body2' sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      {moment(params.row.timestamp).format("MMM D, YYYY h:mm:ss A")}
     </Typography>
    ),
   },
  ],
  [offset, rows],
 );

 const closeDetail = () => setDetailId(null);

 const listErr = logsQ.error instanceof Error ? logsQ.error.message : logsQ.error ? String(logsQ.error) : null;
 const detailErr = detailQ.isError ? (detailQ.error instanceof Error ? detailQ.error.message : "Failed to load detail") : null;

 useToastOnChange(listErr, "error");
 useToastOnChange(detailErr, "error");

 const dateValue = useMemo<DateRangeValue>(() => {
  const from = moment(filters.dateFrom, "YYYY-MM-DD", true);
  const to = moment(filters.dateTo, "YYYY-MM-DD", true);
  const start = (from.isValid() ? from : moment()).startOf("day").toDate();
  const end = (to.isValid() ? to : moment(start)).endOf("day").toDate();
  return { start, end };
 }, [filters.dateFrom, filters.dateTo]);

 const onDateChange = useCallback((next: DateRangeValue) => {
  patchLogsFilters({
   dateFrom: moment(next.start).format("YYYY-MM-DD"),
   dateTo: moment(next.end).format("YYYY-MM-DD"),
  });
 }, []);

 const onDateModeChange = useCallback((dateMode: "single" | "range") => {
  patchLogsFilters({ dateMode });
 }, []);

 const onStatusChange = useCallback((codes: string[]) => {
  patchLogsFilters({ statusCodes: codes.map(Number).sort((a, b) => a - b) });
 }, []);

 const onCallersChange = useCallback((ids: string[]) => {
  patchLogsFilters({
   callerPicks: ids.map((id) => callersById.current.get(id)).filter((c): c is Caller => Boolean(c)),
  });
 }, []);

 const onPaginationModelChange = useCallback(
  (m: { page: number; pageSize: number }) => {
   const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
   setPage(Math.min(m.page, maxPage));
  },
  [total],
 );

 const gridSx = useMemo(
  () => ({
   "& .mono-muted": {
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
   },
  }),
  [],
 );

 const refreshLogs = useCallback(() => {
  totalsCache.current.delete(totalKey);
  void logsQ.refetch();
 }, [logsQ, totalKey]);

 return (
  <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
   <PageHeader title='API logs'>
    {selected ? (
     <>
      <FlexibleDatePicker
       value={dateValue}
       onChange={onDateChange}
       mode={filters.dateMode}
       onModeChange={onDateModeChange}
       maxDate={moment().toDate()}
       width={200}
      />
      <MultiSelect
       label='Methods'
       options={METHOD_OPTIONS}
       value={filters.methods}
       onChange={(methods) => patchLogsFilters({ methods })}
       searchPlaceholder='Search methods'
       width={130}
       menuWidth={220}
      />
      <MultiSelect label='Status' groups={STATUS_CODE_GROUPS} value={statusValues} onChange={onStatusChange} searchPlaceholder='Search status codes' width={130} menuWidth={280} />
      <MultiSelect
       label='Callers'
       value={callerIds}
       selectedOptions={callerSelectedOptions}
       onChange={onCallersChange}
       loadOptions={loadCallerOptions}
       searchPlaceholder='Search name, identifier…'
       width={150}
       menuWidth={280}
       disabled={!selected}
      />
      <MultiSelect<LogSearchField>
       label='Search in'
       groups={SEARCH_FIELD_GROUPS}
       value={filters.searchFields}
       onChange={(searchFields) => patchLogsFilters({ searchFields })}
       searchPlaceholder='Search fields'
       width={140}
       menuWidth={260}
      />
      <TextField
       size='small'
       value={searchInput}
       onChange={(e) => setSearchInput(e.target.value)}
       placeholder='Search logs…'
       sx={{
        width: 180,
        minWidth: 180,
        maxWidth: 180,
        flexShrink: 0,
        "& .MuiOutlinedInput-root": { height: 36 },
        "& .MuiInputBase-input": { fontSize: "0.8125rem" },
       }}
      />
      <Button variant='outlined' startIcon={<RefreshIcon />} onClick={refreshLogs} disabled={!logsQ.data} sx={{ borderRadius: 1, height: 36, flexShrink: 0 }}>
       Refresh
      </Button>
     </>
    ) : null}
   </PageHeader>

   {!selected && (
    <Typography variant='body2' color='text.secondary'>
     Choose a project in the top bar to load logs.
    </Typography>
   )}

   {selected && (
    <DataGridTable
     rows={rows}
     columns={columns}
     loading={gridLoading}
     emptyMessage='No logs for these filters.'
     paginationMode='server'
     sortingMode='server'
     rowCount={total}
     paginationModel={{ page, pageSize: PAGE_SIZE }}
     onPaginationModelChange={onPaginationModelChange}
     pageSizeOptions={[PAGE_SIZE]}
     sortModel={sortModel}
     onSortModelChange={onSortModelChange}
     onRowClick={(params) => setDetailId(String(params.id))}
     sx={gridSx}
    />
   )}

   <LogDetailDialog open={detailId != null} onClose={closeDetail} loading={detailQ.isLoading} error={detailErr} data={detailQ.data ?? null} onRetry={() => void detailQ.refetch()} />
  </Stack>
 );
}
