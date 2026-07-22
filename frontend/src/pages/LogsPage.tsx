import BlockIcon from "@mui/icons-material/Block";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import type { GridColDef, GridSortModel } from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { shallow, useStore } from "@tanstack/react-store";
import moment from "moment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLogDetail, fetchLogPaths, listCallers, listLogs, countLogs } from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { FlexibleDatePicker, type DateRangeValue } from "../components/FlexibleDatePicker";
import { LogDetailDialog } from "../components/LogDetailDialog";
import { MethodChip } from "../components/MethodChip";
import { MultiSelect, type MultiSelectGroup, type MultiSelectOption } from "../components/MultiSelect";
import { PageHeader } from "../components/PageHeader";
import { StatusCodeChip } from "../components/StatusCodeChip";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { logsFiltersKey, logsSortKey, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, qk } from "../lib/queryKeys";
import { LOG_METHOD_OPTIONS, normalizeSkipPattern, patchLogsFilters, pathMatchesSkipPattern, setLogsSort, suggestSkipPattern, uiStore, type LogSearchField, type LogsSortState } from "../store/uiStore";
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
 const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
 const filtersKey = useMemo(() => logsFiltersKey(filters), [filters]);
 const sortKey = useMemo(() => logsSortKey(logsSort), [logsSort]);
 const offset = page * pageSize;

 useEffect(() => {
  setSearchInput(filters.search);
 }, [filters.search]);

 useEffect(() => {
  if (debouncedSearch === filters.search) return;
  patchLogsFilters({ search: debouncedSearch });
 }, [debouncedSearch, filters.search]);

 useEffect(() => {
  setPage(0);
 }, [filtersKey, sortKey, pageSize, selected?.id]);

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

 const loadExcludePatternOptions = useCallback(
  async (query: string): Promise<MultiSelectOption[]> => {
   if (!selected) return [];
   const q = query.trim().toLowerCase();
   const paths = await fetchLogPaths(selected.apiKey, selected.environment);
   const patternSet = new Set<string>();
   for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 1) patternSet.add(`/${parts[0]}`);
    if (parts.length >= 2) patternSet.add(`/${parts[0]}/${parts[1]}`);
   }
   const patterns = [...patternSet].sort();
   const matched = (q ? patterns.filter((p) => p.toLowerCase().includes(q)) : patterns).slice(0, 60);
   const opts: MultiSelectOption[] = matched.map((p) => ({
    value: p,
    label: p,
    description: `*${p}*`,
   }));
   const custom = normalizeSkipPattern(query);
   if (custom && !opts.some((o) => o.value === custom)) {
    opts.unshift({ value: custom, label: custom, description: `*${custom}*` });
   }
   return opts;
  },
  [selected],
 );

 const excludePatternSelectedOptions = useMemo(
  () => filters.excludePathPatterns.map((p) => ({ value: p, label: p, description: `*${p}*` })),
  [filters.excludePathPatterns],
 );

 /** Avoid COUNT on every page flip — only recount when filters/sort change. */
 const totalsCache = useRef(new Map<string, number>());
 const totalKey = `${selected?.id ?? ""}|${filtersKey}|${sortKey}`;

 const filterParams = useMemo(() => {
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateMode === "single" ? filters.dateFrom : filters.dateTo;
  return {
   dateFrom,
   dateTo,
   methods: filters.methods.length ? filters.methods.join(",") : undefined,
   search: filters.search.trim() || undefined,
   searchFields: filters.search.trim() && filters.searchFields.length ? filters.searchFields.join(",") : undefined,
   statusCodes: filters.statusCodes.length ? [...filters.statusCodes].sort((a, b) => a - b).join(",") : undefined,
   callerIds: filters.callerPicks.length ? filters.callerPicks.map((c) => c.id).join(",") : undefined,
   excludePathContains: filters.excludePathPatterns.length
    ? [...filters.excludePathPatterns].sort().join(",")
    : undefined,
  };
 }, [filters]);

 // Heal inconsistent state: single mode must never keep a multi-day range.
 useEffect(() => {
  if (filters.dateMode === "single" && filters.dateFrom !== filters.dateTo) {
   patchLogsFilters({ dateTo: filters.dateFrom });
  }
 }, [filters.dateMode, filters.dateFrom, filters.dateTo]);

 // Page rows first (no COUNT) so the grid paints quickly on remote DBs.
 const logsQ = useQuery({
  queryKey: selected ? qk.logsPage(selected.id, filtersKey, sortKey, pageSize, offset) : ["logs", "page", "__none"],
  queryFn: async ({ queryKey }) => {
   // Read limit/offset from the query key so page flips never reuse a stale closure.
   const limit = typeof queryKey[5] === "number" ? queryKey[5] : DEFAULT_PAGE_SIZE;
   const pageOffset = typeof queryKey[6] === "number" ? queryKey[6] : 0;
   return listLogs(selected!.apiKey, selected!.environment, {
    limit,
    offset: pageOffset,
    ...filterParams,
    sort: logsSort.field,
    order: logsSort.order,
   });
  },
  enabled: !!selected,
 });

 const countQ = useQuery({
  queryKey: selected ? ["logs", "count", selected.id, filtersKey] : ["logs", "count", "__none"],
  queryFn: async () => {
   const total = await countLogs(selected!.apiKey, selected!.environment, filterParams);
   totalsCache.current.set(totalKey, total);
   return total;
  },
  enabled: !!selected,
  staleTime: 30_000,
 });

 const rows = logsQ.data?.data ?? [];
 const total = countQ.data ?? totalsCache.current.get(totalKey) ?? (rows.length > 0 ? offset + rows.length + (rows.length === pageSize ? 1 : 0) : 0);
 const gridLoading = logsQ.isPending || logsQ.isFetching;

 useEffect(() => {
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  if (page > maxPage) setPage(maxPage);
 }, [total, page, pageSize]);

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
    renderCell: (params) => {
     const path = String(params.value ?? "");
     const skipPattern = suggestSkipPattern(path);
     const skipped = filters.excludePathPatterns.some((pat) => pathMatchesSkipPattern(path, pat));
     return (
      <Box
       sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        width: "100%",
        minWidth: 0,
        "& .skip-path-btn": { opacity: 0 },
        "&:hover .skip-path-btn": { opacity: 1 },
       }}
      >
       <Typography variant='body2' sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all", flex: 1, minWidth: 0 }}>
        {path}
       </Typography>
       {path ? (
        <Tooltip
         title={
          skipped
           ? "Already covered by a skip pattern"
           : `Skip *${skipPattern}*`
         }
        >
         <span>
          <IconButton
           className='skip-path-btn'
           size='small'
           disabled={skipped}
           aria-label={skipped ? "Path already skipped" : `Skip *${skipPattern}*`}
           onClick={(e) => {
            e.stopPropagation();
            if (skipped || !skipPattern) return;
            if (filters.excludePathPatterns.includes(skipPattern)) return;
            patchLogsFilters({ excludePathPatterns: [...filters.excludePathPatterns, skipPattern] });
           }}
           sx={{ flexShrink: 0 }}
          >
           <BlockIcon fontSize='inherit' />
          </IconButton>
         </span>
        </Tooltip>
       ) : null}
      </Box>
     );
    },
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
  [offset, rows, filters.excludePathPatterns],
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
  const dateFrom = moment(next.start).format("YYYY-MM-DD");
  const dateTo = moment(next.end).format("YYYY-MM-DD");
  patchLogsFilters({ dateFrom, dateTo });
 }, []);

 const onDateModeChange = useCallback((dateMode: "single" | "range") => {
  if (dateMode === "single") {
   const day = uiStore.state.logsFilters.dateFrom;
   patchLogsFilters({ dateMode, dateFrom: day, dateTo: day });
   return;
  }
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
   if (m.pageSize !== pageSize) {
    setPageSize(m.pageSize);
    setPage(0);
    return;
   }
   const maxPage = Math.max(0, Math.ceil(total / m.pageSize) - 1);
   setPage(Math.min(m.page, maxPage));
  },
  [total, pageSize],
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
  void Promise.all([logsQ.refetch(), countQ.refetch()]);
 }, [logsQ, countQ, totalKey]);

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
      <MultiSelect
       label='Skip paths'
       value={filters.excludePathPatterns}
       selectedOptions={excludePatternSelectedOptions}
       onChange={(excludePathPatterns) =>
        patchLogsFilters({
         excludePathPatterns: [...new Set(excludePathPatterns.map(normalizeSkipPattern).filter(Boolean))],
        })
       }
       loadOptions={loadExcludePatternOptions}
       searchPlaceholder='e.g. internal or /cron…'
       width={160}
       menuWidth={360}
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
     getRowId={(row) => row.id}
     loading={gridLoading}
     emptyMessage='No logs for these filters.'
     paginationMode='server'
     sortingMode='server'
     rowCount={total}
     paginationModel={{ page, pageSize }}
     onPaginationModelChange={onPaginationModelChange}
     pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
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
