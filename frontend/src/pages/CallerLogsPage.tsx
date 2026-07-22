import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimelineIcon from "@mui/icons-material/Timeline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { shallow, useStore } from "@tanstack/react-store";
import moment from "moment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCallerSummary, listCallers } from "../api/client";
import { DataGridTable } from "../components/DataGridTable";
import { FlexibleDatePicker, type DateRangeValue } from "../components/FlexibleDatePicker";
import { MultiSelect, type MultiSelectOption } from "../components/MultiSelect";
import { PageHeader } from "../components/PageHeader";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { callerSummaryFetchKey, qk } from "../lib/queryKeys";
import {
  DEFAULT_SLOW_MIN_MS,
  LOG_METHOD_OPTIONS,
  patchCallerLogsFilters,
  uiStore,
} from "../store/uiStore";
import type { Caller, CallerSummary, CallerSummaryRow } from "../types";

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

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatPct(n: number): string {
  return `${n}%`;
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

function applyCallerPicks(data: CallerSummary, picks: Caller[]): CallerSummary {
  if (!picks.length) return data;
  const ids = new Set(picks.map((c) => c.id));
  const callers = data.callers.filter((c) => ids.has(c.callerId));
  const totalRequests = callers.reduce((s, c) => s + c.total, 0);
  const slowRequests = callers.reduce((s, c) => s + c.slow, 0);
  const error4xx = callers.reduce((s, c) => s + c.error4xx, 0);
  const error5xx = callers.reduce((s, c) => s + c.error5xx, 0);
  const avgMs =
    totalRequests > 0 ? Math.round(callers.reduce((s, c) => s + c.avgMs * c.total, 0) / totalRequests) : 0;
  const p95Ms = callers.length ? Math.max(...callers.map((c) => c.p95Ms)) : 0;
  return {
    ...data,
    callers,
    totalRequests,
    slowRequests,
    error4xx,
    error5xx,
    callerCount: callers.length,
    avgMs,
    p95Ms,
  };
}

export function CallerLogsPage() {
  const { selected } = useProjectWorkspace();
  const filters = useStore(uiStore, (s) => s.callerLogsFilters, shallow);
  const [minMsInput, setMinMsInput] = useState(String(filters.minResponseTimeMs ?? DEFAULT_SLOW_MIN_MS));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const fetchKey = useMemo(
    () =>
      callerSummaryFetchKey({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateMode === "single" ? filters.dateFrom : filters.dateTo,
        methods: filters.methods,
        minResponseTimeMs: filters.minResponseTimeMs,
      }),
    [filters.dateFrom, filters.dateTo, filters.dateMode, filters.methods, filters.minResponseTimeMs],
  );

  useEffect(() => {
    setMinMsInput(String(filters.minResponseTimeMs));
  }, [filters.minResponseTimeMs]);

  useEffect(() => {
    setPage(0);
  }, [fetchKey, filters.callerPicks, pageSize, selected?.id]);

  useEffect(() => {
    if (filters.dateMode === "single" && filters.dateFrom !== filters.dateTo) {
      patchCallerLogsFilters({ dateTo: filters.dateFrom });
    }
  }, [filters.dateMode, filters.dateFrom, filters.dateTo]);

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
    queryKey: selected ? qk.callerSummary(selected.id, fetchKey) : ["logs", "caller-summary", "__none"],
    queryFn: () => fetchCallerSummary(selected!.apiKey, selected!.environment, summaryParams),
    enabled: !!selected,
    staleTime: 60_000,
  });

  const data = useMemo(() => {
    if (!summaryQ.data) return undefined;
    return applyCallerPicks(summaryQ.data, filters.callerPicks);
  }, [summaryQ.data, filters.callerPicks]);

  const err = summaryQ.error instanceof Error ? summaryQ.error.message : summaryQ.error ? String(summaryQ.error) : null;
  useToastOnChange(err, "error");

  const columns = useMemo<GridColDef<CallerSummaryRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Caller",
        flex: 1.4,
        minWidth: 160,
        renderCell: (p) => (
          <Chip label={p.row.name} size="small" color="secondary" variant="outlined" sx={{ fontWeight: 700 }} />
        ),
      },
      {
        field: "total",
        headerName: "Requests",
        width: 110,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
            {formatInt(p.row.total)}
          </Typography>
        ),
      },
      {
        field: "slow",
        headerName: "Slow",
        width: 100,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {formatInt(p.row.slow)}
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
        field: "error4xx",
        headerName: "4xx",
        width: 80,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatInt(p.row.error4xx)}
          </Typography>
        ),
      },
      {
        field: "error5xx",
        headerName: "5xx",
        width: 80,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: p.row.error5xx ? 700 : 400 }}>
            {formatInt(p.row.error5xx)}
          </Typography>
        ),
      },
      {
        field: "uniquePaths",
        headerName: "Paths",
        width: 90,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {formatInt(p.row.uniquePaths)}
          </Typography>
        ),
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
    ],
    [],
  );

  const dateValue = useMemo<DateRangeValue>(() => {
    const from = moment(filters.dateFrom, "YYYY-MM-DD", true);
    const to = moment(filters.dateTo, "YYYY-MM-DD", true);
    const start = (from.isValid() ? from : moment()).startOf("day").toDate();
    const end = (to.isValid() ? to : moment(start)).endOf("day").toDate();
    return { start, end };
  }, [filters.dateFrom, filters.dateTo]);

  const onDateChange = useCallback((next: DateRangeValue) => {
    patchCallerLogsFilters({
      dateFrom: moment(next.start).format("YYYY-MM-DD"),
      dateTo: moment(next.end).format("YYYY-MM-DD"),
    });
  }, []);

  const onDateModeChange = useCallback((dateMode: "single" | "range") => {
    if (dateMode === "single") {
      const day = uiStore.state.callerLogsFilters.dateFrom;
      patchCallerLogsFilters({ dateMode, dateFrom: day, dateTo: day });
      return;
    }
    patchCallerLogsFilters({ dateMode });
  }, []);

  const onCallersChange = useCallback((ids: string[]) => {
    patchCallerLogsFilters({
      callerPicks: ids.map((id) => callersById.current.get(id)).filter((c): c is Caller => Boolean(c)),
    });
  }, []);

  const applyMinMs = useCallback(
    (raw: string) => {
      const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(n) || n < 0) {
        setMinMsInput(String(filters.minResponseTimeMs));
        return;
      }
      patchCallerLogsFilters({ minResponseTimeMs: n });
      setMinMsInput(String(n));
    },
    [filters.minResponseTimeMs],
  );

  const presetValue = THRESHOLD_PRESETS.some((p) => p.value === filters.minResponseTimeMs)
    ? String(filters.minResponseTimeMs)
    : "custom";

  const slowPct =
    data && data.totalRequests > 0 ? Math.round((data.slowRequests / data.totalRequests) * 1000) / 10 : 0;
  const errorPct =
    data && data.totalRequests > 0
      ? Math.round(((data.error4xx + data.error5xx) / data.totalRequests) * 1000) / 10
      : 0;

  return (
    <Stack spacing={2} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <PageHeader title="Caller logs">
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
              label="Callers"
              value={callerIds}
              selectedOptions={callerSelectedOptions}
              onChange={onCallersChange}
              loadOptions={loadCallerOptions}
              searchPlaceholder="Filter callers…"
              width={180}
              menuWidth={300}
              disabled={!selected}
            />
            <MultiSelect
              label="Methods"
              options={METHOD_OPTIONS}
              value={filters.methods}
              onChange={(methods) => patchCallerLogsFilters({ methods })}
              searchPlaceholder="Search methods"
              width={130}
              menuWidth={220}
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
                patchCallerLogsFilters({ minResponseTimeMs: n });
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
          Choose a project in the top bar to load caller summary.
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
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, minmax(0, 1fr))" },
              gap: 1.25,
              alignItems: "start",
              flexShrink: 0,
            }}
          >
            <StatCard
              title="Requests"
              value={formatInt(data.totalRequests)}
              subtitle={`${formatInt(data.callerCount)} callers with traffic`}
              icon={<TimelineIcon sx={{ fontSize: 18 }} />}
              accent="#2563eb"
            />
            <StatCard
              title="Slow requests"
              value={`${formatInt(data.slowRequests)} / ${formatInt(data.totalRequests)}`}
              subtitle={`${slowPct}% ≥ ${data.thresholdMs} ms`}
              icon={<SpeedOutlinedIcon sx={{ fontSize: 18 }} />}
              accent="#dc2626"
            />
            <StatCard
              title="Errors"
              value={`${formatInt(data.error4xx + data.error5xx)}`}
              subtitle={`4xx ${formatInt(data.error4xx)} · 5xx ${formatInt(data.error5xx)} · ${errorPct}%`}
              icon={<WarningAmberIcon sx={{ fontSize: 18 }} />}
              accent="#ea580c"
            />
            <StatCard
              title="Latency"
              value={`${formatInt(data.avgMs)} ms`}
              subtitle={`avg · p95 ${formatInt(data.p95Ms)} ms`}
              icon={<PeopleOutlineIcon sx={{ fontSize: 18 }} />}
              accent="#059669"
            />
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexShrink: 0 }}>
            <Typography variant="body2" fontWeight={700}>
              Per caller ({data.callers.length})
            </Typography>
            {summaryQ.isFetching ? <CircularProgress size={16} /> : null}
          </Stack>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DataGridTable
              rows={data.callers}
              columns={columns}
              getRowId={(row) => row.callerId}
              loading={false}
              emptyMessage="No caller-attributed traffic for these filters."
              paginationMode="client"
              sortingMode="client"
              paginationModel={{ page, pageSize }}
              onPaginationModelChange={(m) => {
                setPageSize(m.pageSize);
                setPage(m.page);
              }}
              pageSizeOptions={[25, 50, 100]}
            />
          </Box>
        </>
      ) : null}

      {selected && !summaryQ.isLoading && !data && !err ? (
        <Typography variant="body2" color="text.secondary">
          No data for these filters.
        </Typography>
      ) : null}
    </Stack>
  );
}
