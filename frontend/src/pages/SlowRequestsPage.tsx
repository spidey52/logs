import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimelineIcon from "@mui/icons-material/Timeline";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { alpha } from "@mui/material/styles";
import type { GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { shallow, useStore } from "@tanstack/react-store";
import moment from "moment";
import { useCallback, useEffect, useMemo, useState } from "react";
import { countLogs, fetchLogDetail, fetchLogPaths, fetchSlowSummary, listLogs } from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { FlexibleDatePicker, type DateRangeValue } from "../components/FlexibleDatePicker";
import { LogDetailDialog } from "../components/LogDetailDialog";
import { MethodChip } from "../components/MethodChip";
import { MultiSelect, type MultiSelectOption } from "../components/MultiSelect";
import { PageHeader } from "../components/PageHeader";
import { StatusCodeChip } from "../components/StatusCodeChip";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, qk, slowFiltersKey, slowSummaryFetchKey } from "../lib/queryKeys";
import {
  LOG_METHOD_OPTIONS,
  normalizeSkipPattern,
  patchSlowFilters,
  pathMatchesSkipPattern,
  uiStore,
} from "../store/uiStore";
import type { ApiLog, SlowBuckets, SlowEndpointRow, SlowPatternRow, SlowSummary } from "../types";

function emptyBuckets(): SlowBuckets {
  return { b500: 0, b1000: 0, b2000: 0, b5000: 0 };
}

function pathPattern(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/*";
  return `/${parts[0]}/*`;
}

function isEndpointVisible(path: string, skipPatterns: string[], hidden: string[]): boolean {
  if (hidden.includes(path)) return false;
  return !skipPatterns.some((pat) => pathMatchesSkipPattern(path, pat));
}

function sumBuckets(endpoints: SlowEndpointRow[]): SlowBuckets {
  const out = emptyBuckets();
  for (const e of endpoints) {
    out.b500 += e.buckets.b500;
    out.b1000 += e.buckets.b1000;
    out.b2000 += e.buckets.b2000;
    out.b5000 += e.buckets.b5000;
  }
  return out;
}

function buildPatterns(endpoints: SlowEndpointRow[]): SlowPatternRow[] {
  const map = new Map<string, { total: number; slow: number; endpoints: number; buckets: SlowBuckets }>();
  for (const e of endpoints) {
    const pattern = e.pattern || pathPattern(e.path);
    const cur = map.get(pattern) ?? { total: 0, slow: 0, endpoints: 0, buckets: emptyBuckets() };
    cur.total += e.total;
    cur.slow += e.slow;
    cur.endpoints += 1;
    cur.buckets.b500 += e.buckets.b500;
    cur.buckets.b1000 += e.buckets.b1000;
    cur.buckets.b2000 += e.buckets.b2000;
    cur.buckets.b5000 += e.buckets.b5000;
    map.set(pattern, cur);
  }
  return [...map.entries()]
    .map(([pattern, v]) => ({
      pattern,
      total: v.total,
      slow: v.slow,
      slowPct: v.total > 0 ? Math.round((v.slow / v.total) * 1000) / 10 : 0,
      endpoints: v.endpoints,
      buckets: v.buckets,
    }))
    .sort((a, b) => b.slow - a.slow);
}

/** Apply hide + skip filters in the UI over the full summary payload. */
function applyClientSlowFilters(
  data: SlowSummary,
  skipPatterns: string[],
  hidden: string[],
): SlowSummary {
  const endpoints = data.endpoints.filter((e) => isEndpointVisible(e.path, skipPatterns, hidden));
  const excluded = data.endpoints.filter((e) => !isEndpointVisible(e.path, skipPatterns, hidden));
  const excludedSlow = excluded.reduce((s, e) => s + e.slow, 0);
  const excludedTotal = excluded.reduce((s, e) => s + e.total, 0);
  return {
    ...data,
    endpoints,
    patterns: buildPatterns(endpoints),
    buckets: sumBuckets(endpoints),
    slowRequests: Math.max(0, data.slowRequests - excludedSlow),
    totalRequests: Math.max(0, data.totalRequests - excludedTotal),
    slowEndpoints: endpoints.length,
    totalEndpoints: Math.max(0, data.totalEndpoints - excluded.length),
  };
}

const METHOD_OPTIONS: MultiSelectOption[] = LOG_METHOD_OPTIONS.map((m) => ({
  value: m,
  label: m,
}));

const THRESHOLD_PRESETS = [
  { value: 500, label: "≥ 500 ms" },
  { value: 1000, label: "≥ 1 s" },
  { value: 2000, label: "≥ 2 s" },
  { value: 5000, label: "≥ 5 s" },
] as const;

const BUCKET_META: { key: keyof SlowBuckets; label: string; color: string }[] = [
  { key: "b500", label: "500ms – 1s", color: "#ca8a04" },
  { key: "b1000", label: "1s – 2s", color: "#ea580c" },
  { key: "b2000", label: "2s – 5s", color: "#dc2626" },
  { key: "b5000", label: "≥ 5s", color: "#7f1d1d" },
];

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatPct(n: number): string {
  return `${n}%`;
}

function MsChip({ ms }: { ms: number }) {
  const color = ms < 120 ? ("success" as const) : ms < 400 ? ("primary" as const) : ms < 1500 ? ("warning" as const) : ("error" as const);
  return <Chip label={`${ms} ms`} size="small" color={color} variant="outlined" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card sx={{ alignSelf: "start" }}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              bgcolor: alpha(accent, 0.12),
              color: accent,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography color="text.secondary" variant="caption" fontWeight={600} display="block" sx={{ lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              {value}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
                {subtitle}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Compact stacked bar + legend — lean enough for a summary strip. */
function LatencyPatternCard({ buckets }: { buckets: SlowBuckets }) {
  const visible = BUCKET_META.filter((b) => buckets[b.key] > 0);

  return (
    <Card sx={{ alignSelf: "start" }}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography color="text.secondary" variant="caption" fontWeight={600} display="block" sx={{ mb: 1, lineHeight: 1.2 }}>
          Latency pattern
        </Typography>
        {!visible.length ? (
          <Typography variant="caption" color="text.secondary">
            No slow requests in latency buckets.
          </Typography>
        ) : (
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
            {visible.map((b) => (
              <Chip
                key={b.key}
                size="small"
                label={`${b.label} · ${formatInt(buckets[b.key])}`}
                sx={{
                  height: 22,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  bgcolor: alpha(b.color, 0.1),
                  color: b.color,
                  border: `1px solid ${alpha(b.color, 0.22)}`,
                  "& .MuiChip-label": { px: 0.75 },
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function BucketChips({ buckets }: { buckets: SlowBuckets }) {
  const visible = BUCKET_META.filter((b) => buckets[b.key] > 0);
  if (!visible.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {visible.map((b) => (
        <Chip
          key={b.key}
          size="small"
          label={`${b.label.split("–")[0]?.trim() ?? b.label}: ${formatInt(buckets[b.key])}`}
          sx={{
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            bgcolor: alpha(b.color, 0.1),
            color: b.color,
            border: `1px solid ${alpha(b.color, 0.25)}`,
          }}
          variant="outlined"
        />
      ))}
    </Stack>
  );
}

export function SlowRequestsPage() {
  const { selected } = useProjectWorkspace();
  const filters = useStore(uiStore, (s) => s.slowFilters, shallow);
  const [minMsInput, setMinMsInput] = useState(String(filters.minResponseTimeMs));
  const [tab, setTab] = useState<"endpoints" | "patterns" | "requests">("endpoints");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [requestsPage, setRequestsPage] = useState(0);
  const [requestsPageSize, setRequestsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedEndpoint, setSelectedEndpoint] = useState<SlowEndpointRow | null>(null);
  const [endpointPage, setEndpointPage] = useState(0);
  const [endpointPageSize, setEndpointPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtersKey = useMemo(() => slowFiltersKey(filters), [filters]);
  const summaryFetchKey = useMemo(
    () =>
      slowSummaryFetchKey({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateMode === "single" ? filters.dateFrom : filters.dateTo,
        minResponseTimeMs: filters.minResponseTimeMs,
        methods: filters.methods,
      }),
    [filters.dateFrom, filters.dateTo, filters.dateMode, filters.minResponseTimeMs, filters.methods],
  );

  useEffect(() => {
    setMinMsInput(String(filters.minResponseTimeMs));
  }, [filters.minResponseTimeMs]);

  useEffect(() => {
    setPage(0);
    setRequestsPage(0);
  }, [filtersKey, tab]);

  useEffect(() => {
    setEndpointPage(0);
  }, [selectedEndpoint?.path, filtersKey]);

  useEffect(() => {
    if (filters.dateMode === "single" && filters.dateFrom !== filters.dateTo) {
      patchSlowFilters({ dateTo: filters.dateFrom });
    }
  }, [filters.dateMode, filters.dateFrom, filters.dateTo]);

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
      const opts: MultiSelectOption[] = matched.map((p) => ({ value: p, label: p, description: `*${p}*` }));
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

  const hiddenEndpointSelectedOptions = useMemo(
    () => filters.hiddenEndpoints.map((p) => ({ value: p, label: p })),
    [filters.hiddenEndpoints],
  );

  const hideEndpoint = useCallback((path: string) => {
    if (filters.hiddenEndpoints.includes(path)) return;
    patchSlowFilters({ hiddenEndpoints: [...filters.hiddenEndpoints, path] });
    setSelectedEndpoint((cur) => (cur?.path === path ? null : cur));
  }, [filters.hiddenEndpoints]);

  /** Date/method/threshold only — hide & skip applied in the UI. */
  const summaryParams = useMemo(() => {
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateMode === "single" ? filters.dateFrom : filters.dateTo;
    return {
      dateFrom,
      dateTo,
      methods: filters.methods.length ? filters.methods.join(",") : undefined,
      minResponseTimeMs: filters.minResponseTimeMs,
      limit: 2000,
    };
  }, [filters.dateFrom, filters.dateTo, filters.dateMode, filters.methods, filters.minResponseTimeMs]);

  const summaryQ = useQuery({
    queryKey: selected ? qk.slowSummary(selected.id, summaryFetchKey) : ["logs", "slow-summary", "__none"],
    queryFn: () => fetchSlowSummary(selected!.apiKey, selected!.environment, summaryParams),
    enabled: !!selected,
    staleTime: 60_000,
  });

  const data = useMemo(() => {
    if (!summaryQ.data) return undefined;
    return applyClientSlowFilters(summaryQ.data, filters.excludePathPatterns, filters.hiddenEndpoints);
  }, [summaryQ.data, filters.excludePathPatterns, filters.hiddenEndpoints]);

  const err = summaryQ.error instanceof Error ? summaryQ.error.message : summaryQ.error ? String(summaryQ.error) : null;
  useToastOnChange(err, "error");

  const requestsOffset = requestsPage * requestsPageSize;
  /** Requests tab stays server-paginated and honors hide/skip. */
  const slowListParams = useMemo(() => {
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateMode === "single" ? filters.dateFrom : filters.dateTo;
    return {
      dateFrom,
      dateTo,
      methods: filters.methods.length ? filters.methods.join(",") : undefined,
      excludePathContains: filters.excludePathPatterns.length
        ? [...filters.excludePathPatterns].sort().join(",")
        : undefined,
      excludeExactPaths: filters.hiddenEndpoints.length
        ? [...filters.hiddenEndpoints].sort().join(",")
        : undefined,
      minResponseTimeMs: filters.minResponseTimeMs,
      sort: "response_time_ms" as const,
      order: "desc" as const,
    };
  }, [filters]);

  const slowListQ = useQuery({
    queryKey: selected
      ? ["slow-requests-list", selected.id, filtersKey, requestsPageSize, requestsOffset]
      : ["slow-requests-list", "__none"],
    queryFn: () =>
      listLogs(selected!.apiKey, selected!.environment, {
        ...slowListParams,
        limit: requestsPageSize,
        offset: requestsOffset,
      }),
    enabled: !!selected && tab === "requests",
  });

  const slowListCountQ = useQuery({
    queryKey: selected ? ["slow-requests-count", selected.id, filtersKey] : ["slow-requests-count", "__none"],
    queryFn: async () => {
      const { sort: _s, order: _o, ...countParams } = slowListParams;
      return countLogs(selected!.apiKey, selected!.environment, countParams);
    },
    enabled: !!selected && tab === "requests",
    staleTime: 30_000,
  });

  const endpointOffset = endpointPage * endpointPageSize;
  const endpointListParams = useMemo(() => {
    if (!selectedEndpoint) return null;
    const dateFrom = filters.dateFrom;
    const dateTo = filters.dateMode === "single" ? filters.dateFrom : filters.dateTo;
    return {
      dateFrom,
      dateTo,
      exactPath: selectedEndpoint.path,
      methods: filters.methods.length ? filters.methods.join(",") : undefined,
      minResponseTimeMs: filters.minResponseTimeMs,
      sort: "response_time_ms" as const,
      order: "desc" as const,
    };
  }, [selectedEndpoint, filters]);

  const endpointLogsQ = useQuery({
    queryKey:
      selected && selectedEndpoint && endpointListParams
        ? ["slow-endpoint-logs", selected.id, selectedEndpoint.path, filtersKey, endpointPageSize, endpointOffset]
        : ["slow-endpoint-logs", "__none"],
    queryFn: () =>
      listLogs(selected!.apiKey, selected!.environment, {
        ...endpointListParams!,
        limit: endpointPageSize,
        offset: endpointOffset,
      }),
    enabled: !!selected && !!selectedEndpoint && !!endpointListParams,
  });

  const endpointCountQ = useQuery({
    queryKey:
      selected && selectedEndpoint && endpointListParams
        ? ["slow-endpoint-count", selected.id, selectedEndpoint.path, filtersKey]
        : ["slow-endpoint-count", "__none"],
    queryFn: async () => {
      const { sort: _s, order: _o, ...countParams } = endpointListParams!;
      return countLogs(selected!.apiKey, selected!.environment, countParams);
    },
    enabled: !!selected && !!selectedEndpoint && !!endpointListParams,
    staleTime: 30_000,
  });

  const detailQ = useQuery({
    queryKey: selected && detailId ? qk.logDetail(selected.id, detailId) : ["logs", "detail", "__none"],
    queryFn: () => fetchLogDetail(selected!.apiKey, selected!.environment, detailId!),
    enabled: !!selected && !!detailId,
  });

  const endpointRows = endpointLogsQ.data?.data ?? [];
  const endpointTotal = endpointCountQ.data ?? selectedEndpoint?.slow ?? endpointRows.length;
  const slowListRows = slowListQ.data?.data ?? [];
  const slowListTotal = slowListCountQ.data ?? data?.slowRequests ?? slowListRows.length;
  const listErr =
    endpointLogsQ.error instanceof Error
      ? endpointLogsQ.error.message
      : endpointLogsQ.error
        ? String(endpointLogsQ.error)
        : slowListQ.error instanceof Error
          ? slowListQ.error.message
          : slowListQ.error
            ? String(slowListQ.error)
            : null;
  const detailErr = detailQ.isError
    ? detailQ.error instanceof Error
      ? detailQ.error.message
      : "Failed to load detail"
    : null;
  useToastOnChange(listErr, "error");
  useToastOnChange(detailErr, "error");

  const requestColumns = useMemo<GridColDef<ApiLog>[]>(
    () => [
      {
        field: "index",
        headerName: "#",
        width: 56,
        sortable: false,
        valueGetter: (_v, row) => {
          const idx = endpointRows.findIndex((r) => r.id === row.id);
          return idx >= 0 ? endpointOffset + idx + 1 : "";
        },
        cellClassName: "mono-muted",
      },
      {
        field: "caller",
        headerName: "Caller",
        flex: 1,
        minWidth: 120,
        valueGetter: (_v, row) => row.caller?.name ?? "",
        renderCell: (params) =>
          params.row.caller ? (
            <Chip label={params.row.caller.name} size="small" color="secondary" variant="outlined" />
          ) : (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          ),
      },
      {
        field: "method",
        headerName: "Method",
        width: 100,
        renderCell: (params) => <MethodChip method={params.value} />,
      },
      {
        field: "status_code",
        headerName: "Status",
        width: 100,
        valueGetter: (_v, row) => row.statusCode,
        renderCell: (params) => <StatusCodeChip code={params.row.statusCode} />,
      },
      {
        field: "response_time_ms",
        headerName: "Duration",
        width: 120,
        valueGetter: (_v, row) => row.responseTimeMs,
        renderCell: (params) => <MsChip ms={params.row.responseTimeMs} />,
      },
      {
        field: "timestamp",
        headerName: "Time",
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.timestamp,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {moment(params.row.timestamp).format("MMM D, YYYY h:mm:ss A")}
          </Typography>
        ),
      },
    ],
    [endpointOffset, endpointRows],
  );

  const allSlowRequestColumns = useMemo<GridColDef<ApiLog>[]>(
    () => [
      {
        field: "index",
        headerName: "#",
        width: 56,
        sortable: false,
        valueGetter: (_v, row) => {
          const idx = slowListRows.findIndex((r) => r.id === row.id);
          return idx >= 0 ? requestsOffset + idx + 1 : "";
        },
        cellClassName: "mono-muted",
      },
      {
        field: "path",
        headerName: "Path",
        flex: 2,
        minWidth: 200,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: "caller",
        headerName: "Caller",
        flex: 1,
        minWidth: 120,
        valueGetter: (_v, row) => row.caller?.name ?? "",
        renderCell: (params) =>
          params.row.caller ? (
            <Chip label={params.row.caller.name} size="small" color="secondary" variant="outlined" />
          ) : (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          ),
      },
      {
        field: "method",
        headerName: "Method",
        width: 100,
        renderCell: (params) => <MethodChip method={params.value} />,
      },
      {
        field: "status_code",
        headerName: "Status",
        width: 100,
        valueGetter: (_v, row) => row.statusCode,
        renderCell: (params) => <StatusCodeChip code={params.row.statusCode} />,
      },
      {
        field: "response_time_ms",
        headerName: "Duration",
        width: 120,
        valueGetter: (_v, row) => row.responseTimeMs,
        renderCell: (params) => <MsChip ms={params.row.responseTimeMs} />,
      },
      {
        field: "timestamp",
        headerName: "Time",
        width: 200,
        valueGetter: (_v, row) => row.timestamp,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {moment(params.row.timestamp).format("MMM D, YYYY h:mm:ss A")}
          </Typography>
        ),
      },
    ],
    [requestsOffset, slowListRows],
  );

  const dateValue = useMemo<DateRangeValue>(() => {
    const from = moment(filters.dateFrom, "YYYY-MM-DD", true);
    const to = moment(filters.dateTo, "YYYY-MM-DD", true);
    const start = (from.isValid() ? from : moment()).startOf("day").toDate();
    const end = (to.isValid() ? to : moment(start)).endOf("day").toDate();
    return { start, end };
  }, [filters.dateFrom, filters.dateTo]);

  const onDateChange = useCallback((next: DateRangeValue) => {
    patchSlowFilters({
      dateFrom: moment(next.start).format("YYYY-MM-DD"),
      dateTo: moment(next.end).format("YYYY-MM-DD"),
    });
  }, []);

  const onDateModeChange = useCallback((dateMode: "single" | "range") => {
    if (dateMode === "single") {
      const day = uiStore.state.slowFilters.dateFrom;
      patchSlowFilters({ dateMode, dateFrom: day, dateTo: day });
      return;
    }
    patchSlowFilters({ dateMode });
  }, []);

  const applyMinMs = useCallback(
    (raw: string) => {
      const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(n) || n < 0) {
        setMinMsInput(String(filters.minResponseTimeMs));
        return;
      }
      patchSlowFilters({ minResponseTimeMs: n });
      setMinMsInput(String(n));
    },
    [filters.minResponseTimeMs],
  );

  const endpointColumns = useMemo<GridColDef<SlowEndpointRow>[]>(
    () => [
      {
        field: "path",
        headerName: "Endpoint",
        flex: 2,
        minWidth: 220,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
            {p.value}
          </Typography>
        ),
      },
      {
        field: "pattern",
        headerName: "Pattern",
        width: 120,
        renderCell: (p) => (
          <Chip label={String(p.value)} size="small" variant="outlined" sx={{ fontFamily: "ui-monospace, monospace" }} />
        ),
      },
      {
        field: "slow",
        headerName: "Slow / total",
        width: 130,
        valueGetter: (_v, row) => row.slow,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {formatInt(p.row.slow)} / {formatInt(p.row.total)}
          </Typography>
        ),
      },
      {
        field: "slowPct",
        headerName: "Slow %",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatPct(p.row.slowPct)}
          </Typography>
        ),
      },
      {
        field: "buckets",
        headerName: "Latency buckets",
        flex: 1.4,
        minWidth: 260,
        sortable: false,
        renderCell: (p) => <BucketChips buckets={p.row.buckets} />,
      },
      {
        field: "avgMs",
        headerName: "Avg",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatInt(p.row.avgMs)} ms
          </Typography>
        ),
      },
      {
        field: "p95Ms",
        headerName: "p95",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatInt(p.row.p95Ms)} ms
          </Typography>
        ),
      },
      {
        field: "maxMs",
        headerName: "Max",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
            {formatInt(p.row.maxMs)} ms
          </Typography>
        ),
      },
      {
        field: "actions",
        headerName: "",
        width: 52,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: "center",
        headerAlign: "center",
        renderCell: (p) => (
          <Tooltip title="Hide this endpoint">
            <IconButton
              size="small"
              aria-label={`Hide ${p.row.path}`}
              onClick={(e) => {
                e.stopPropagation();
                hideEndpoint(p.row.path);
              }}
            >
              <VisibilityOffOutlinedIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [hideEndpoint],
  );

  const patternColumns = useMemo<GridColDef<SlowPatternRow>[]>(
    () => [
      {
        field: "pattern",
        headerName: "Pattern",
        flex: 1.2,
        minWidth: 140,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
            {p.value}
          </Typography>
        ),
      },
      {
        field: "endpoints",
        headerName: "Endpoints",
        width: 110,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatInt(p.row.endpoints)}
          </Typography>
        ),
      },
      {
        field: "slow",
        headerName: "Slow / total",
        width: 140,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {formatInt(p.row.slow)} / {formatInt(p.row.total)}
          </Typography>
        ),
      },
      {
        field: "slowPct",
        headerName: "Slow %",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatPct(p.row.slowPct)}
          </Typography>
        ),
      },
      {
        field: "buckets",
        headerName: "Latency buckets",
        flex: 1.6,
        minWidth: 300,
        sortable: false,
        renderCell: (p) => <BucketChips buckets={p.row.buckets} />,
      },
    ],
    [],
  );

  const presetValue = THRESHOLD_PRESETS.some((p) => p.value === filters.minResponseTimeMs)
    ? String(filters.minResponseTimeMs)
    : "custom";

  const slowReqPct =
    data && data.totalRequests > 0 ? Math.round((data.slowRequests / data.totalRequests) * 1000) / 10 : 0;
  const slowEpPct =
    data && data.totalEndpoints > 0 ? Math.round((data.slowEndpoints / data.totalEndpoints) * 1000) / 10 : 0;

  return (
    <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <PageHeader title="Slow requests">
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
            <TextField
              select
              size="small"
              label="Slow if"
              value={presetValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") return;
                const n = Number(v);
                patchSlowFilters({ minResponseTimeMs: n });
                setMinMsInput(String(n));
              }}
              sx={{ width: 130, "& .MuiOutlinedInput-root": { height: 36 } }}
            >
              {THRESHOLD_PRESETS.map((p) => (
                <MenuItem key={p.value} value={String(p.value)}>
                  {p.label}
                </MenuItem>
              ))}
              <MenuItem value="custom">Custom…</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="ms"
              value={minMsInput}
              onChange={(e) => setMinMsInput(e.target.value)}
              onBlur={() => applyMinMs(minMsInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyMinMs(minMsInput);
                }
              }}
              sx={{
                width: 100,
                "& .MuiOutlinedInput-root": { height: 36 },
                "& .MuiInputBase-input": { fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" },
              }}
            />
            <MultiSelect
              label="Methods"
              options={METHOD_OPTIONS}
              value={filters.methods}
              onChange={(methods) => patchSlowFilters({ methods })}
              searchPlaceholder="Search methods"
              width={130}
              menuWidth={220}
            />
            <MultiSelect
              label="Skip paths"
              value={filters.excludePathPatterns}
              selectedOptions={excludePatternSelectedOptions}
              onChange={(excludePathPatterns) =>
                patchSlowFilters({
                  excludePathPatterns: [...new Set(excludePathPatterns.map(normalizeSkipPattern).filter(Boolean))],
                })
              }
              loadOptions={loadExcludePatternOptions}
              searchPlaceholder="e.g. internal or /cron…"
              width={160}
              menuWidth={360}
              disabled={!selected}
            />
            <MultiSelect
              label="Hidden"
              value={filters.hiddenEndpoints}
              options={hiddenEndpointSelectedOptions}
              selectedOptions={hiddenEndpointSelectedOptions}
              onChange={(hiddenEndpoints) => patchSlowFilters({ hiddenEndpoints })}
              searchPlaceholder="Unhide endpoints…"
              width={140}
              menuWidth={360}
              disabled={!selected}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => void summaryQ.refetch()}
              disabled={summaryQ.isFetching}
              sx={{ borderRadius: 1, height: 36, flexShrink: 0 }}
            >
              Refresh
            </Button>
          </>
        ) : null}
      </PageHeader>

      {!selected && (
        <Typography variant="body2" color="text.secondary">
          Choose a project in the top bar to load slow request patterns.
        </Typography>
      )}

      {selected && summaryQ.isLoading && !data ? (
        <Box sx={{ display: "grid", placeItems: "center", flex: 1 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}

      {selected && data ? (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, minmax(0, 1fr)) 1.6fr" },
              gap: 1.25,
              alignItems: "start",
              flexShrink: 0,
            }}
          >
            <StatCard
              title="Slow requests"
              value={`${formatInt(data.slowRequests)} / ${formatInt(data.totalRequests)}`}
              subtitle={`${slowReqPct}% of traffic ≥ ${data.thresholdMs} ms`}
              icon={<SpeedOutlinedIcon sx={{ fontSize: 18 }} />}
              accent="#dc2626"
            />
            <StatCard
              title="Slow endpoints"
              value={`${formatInt(data.slowEndpoints)} / ${formatInt(data.totalEndpoints)}`}
              subtitle={`${slowEpPct}% of endpoints had ≥1 slow call`}
              icon={<WarningAmberIcon sx={{ fontSize: 18 }} />}
              accent="#ea580c"
            />
            <StatCard
              title="Patterns"
              value={formatInt(data.patterns.length)}
              subtitle="Path prefixes with slow traffic"
              icon={<TimelineIcon sx={{ fontSize: 18 }} />}
              accent="#2563eb"
            />
            <LatencyPatternCard buckets={data.buckets} />
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexShrink: 0 }}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ minHeight: 36 }}>
              <Tab value="endpoints" label={`Endpoints (${data.endpoints.length})`} sx={{ minHeight: 36, py: 0 }} />
              <Tab value="patterns" label={`Patterns (${data.patterns.length})`} sx={{ minHeight: 36, py: 0 }} />
              <Tab
                value="requests"
                label={`Requests (${formatInt(data.slowRequests)})`}
                sx={{ minHeight: 36, py: 0 }}
              />
            </Tabs>
            <Stack direction="row" spacing={1} alignItems="center">
              {tab === "endpoints" ? (
                <Typography variant="caption" color="text.secondary">
                  Click a row for slow calls · eye icon hides the endpoint
                </Typography>
              ) : null}
              {tab === "requests" ? (
                <Typography variant="caption" color="text.secondary">
                  All slow calls · slowest first
                </Typography>
              ) : null}
              {summaryQ.isFetching || (tab === "requests" && slowListQ.isFetching) ? <CircularProgress size={16} /> : null}
            </Stack>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {tab === "endpoints" ? (
              <DataGridTable
                rows={data.endpoints}
                columns={endpointColumns}
                getRowId={(row) => row.path}
                loading={false}
                emptyMessage={`No endpoints with requests ≥ ${data.thresholdMs} ms.`}
                paginationMode="client"
                sortingMode="client"
                paginationModel={{ page, pageSize }}
                onPaginationModelChange={(m) => {
                  setPageSize(m.pageSize);
                  setPage(m.page);
                }}
                pageSizeOptions={[25, 50, 100]}
                onRowClick={(params) => setSelectedEndpoint(params.row)}
                sx={{
                  "& .MuiDataGrid-cell": { alignItems: "center" },
                }}
              />
            ) : null}
            {tab === "patterns" ? (
              <DataGridTable
                rows={data.patterns}
                columns={patternColumns}
                getRowId={(row) => row.pattern}
                loading={false}
                emptyMessage="No slow path patterns for these filters."
                paginationMode="client"
                sortingMode="client"
                paginationModel={{ page, pageSize }}
                onPaginationModelChange={(m) => {
                  setPageSize(m.pageSize);
                  setPage(m.page);
                }}
                pageSizeOptions={[25, 50, 100]}
              />
            ) : null}
            {tab === "requests" ? (
              <DataGridTable
                rows={slowListRows}
                columns={allSlowRequestColumns}
                getRowId={(row) => row.id}
                loading={slowListQ.isFetching && !slowListQ.data}
                emptyMessage={`No requests ≥ ${filters.minResponseTimeMs} ms for these filters.`}
                paginationMode="server"
                sortingMode="server"
                rowCount={slowListTotal}
                paginationModel={{ page: requestsPage, pageSize: requestsPageSize }}
                onPaginationModelChange={(m) => {
                  if (m.pageSize !== requestsPageSize) {
                    setRequestsPageSize(m.pageSize);
                    setRequestsPage(0);
                    return;
                  }
                  const maxPage = Math.max(0, Math.ceil(slowListTotal / m.pageSize) - 1);
                  setRequestsPage(Math.min(m.page, maxPage));
                }}
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
                sortModel={[{ field: "response_time_ms", sort: "desc" }]}
                onRowClick={(params) => setDetailId(String(params.id))}
                sx={{
                  "& .mono-muted": {
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                  },
                }}
              />
            ) : null}
          </Box>
        </>
      ) : null}

      {selected && !summaryQ.isLoading && !data && !err ? (
        <Typography variant="body2" color="text.secondary">
          No data for these filters.
        </Typography>
      ) : null}

      <Dialog
        open={!!selectedEndpoint}
        onClose={() => setSelectedEndpoint(null)}
        fullWidth
        maxWidth="lg"
        PaperProps={{ sx: { height: "85vh", maxHeight: 820 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "flex-start", gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
              Slow requests · ≥ {filters.minResponseTimeMs} ms · slowest first
            </Typography>
            <Typography
              variant="h6"
              component="div"
              sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, wordBreak: "break-all", lineHeight: 1.3 }}
            >
              {selectedEndpoint?.path}
            </Typography>
            {selectedEndpoint ? (
              <Typography variant="caption" color="text.secondary">
                {formatInt(selectedEndpoint.slow)} slow / {formatInt(selectedEndpoint.total)} total · p95{" "}
                {formatInt(selectedEndpoint.p95Ms)} ms · max {formatInt(selectedEndpoint.maxMs)} ms
              </Typography>
            ) : null}
          </Box>
          <IconButton aria-label="Close" onClick={() => setSelectedEndpoint(null)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: "flex", flexDirection: "column", p: 0, minHeight: 0 }}>
          <Box sx={{ flex: 1, minHeight: 0, px: 1.5, pb: 1.5, pt: 1 }}>
            <DataGridTable
              rows={endpointRows}
              columns={requestColumns}
              getRowId={(row) => row.id}
              loading={endpointLogsQ.isFetching && !endpointLogsQ.data}
              emptyMessage={`No requests ≥ ${filters.minResponseTimeMs} ms for this endpoint.`}
              paginationMode="server"
              sortingMode="server"
              rowCount={endpointTotal}
              paginationModel={{ page: endpointPage, pageSize: endpointPageSize }}
              onPaginationModelChange={(m) => {
                if (m.pageSize !== endpointPageSize) {
                  setEndpointPageSize(m.pageSize);
                  setEndpointPage(0);
                  return;
                }
                const maxPage = Math.max(0, Math.ceil(endpointTotal / m.pageSize) - 1);
                setEndpointPage(Math.min(m.page, maxPage));
              }}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              sortModel={[{ field: "response_time_ms", sort: "desc" }]}
              onRowClick={(params) => setDetailId(String(params.id))}
              height="100%"
            />
          </Box>
        </DialogContent>
      </Dialog>

      <LogDetailDialog
        open={detailId != null}
        onClose={() => setDetailId(null)}
        loading={detailQ.isLoading}
        error={detailErr}
        data={detailQ.data ?? null}
        onRetry={() => void detailQ.refetch()}
      />
    </Stack>
  );
}
