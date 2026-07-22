import RouteIcon from "@mui/icons-material/Route";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import TimelineIcon from "@mui/icons-material/Timeline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import moment from "moment";
import { useMemo, useState } from "react";
import { fetchLogPaths, fetchLogsAnalytics, fetchLogsStats } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { qk } from "../lib/queryKeys";
import type { LogsAnalytics } from "../types";

type RangeDays = 7 | 14 | 30;

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
    <Card sx={{ height: "100%", overflow: "visible" }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography color="text.secondary" variant="caption" fontWeight={600} gutterBottom display="block">
              {title}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              display: "grid",
              placeItems: "center",
              bgcolor: alpha(accent, 0.12),
              color: accent,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function browserTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

function SparkBars({
  values,
  labels,
  color,
}: {
  values: number[];
  labels: string[];
  color: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 120, pt: 1 }}>
      {values.map((v, i) => (
        <Box key={labels[i] ?? i} sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" sx={{ fontSize: "0.6rem", fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
            {v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v}
          </Typography>
          <Box
            title={`${labels[i]}: ${v.toLocaleString()}`}
            sx={{
              width: "100%",
              maxWidth: 28,
              height: `${Math.max(4, (v / max) * 80)}px`,
              borderRadius: "4px 4px 2px 2px",
              bgcolor: color,
              opacity: 0.85,
            }}
          />
          <Typography variant="caption" sx={{ fontSize: "0.58rem", color: "text.secondary", whiteSpace: "nowrap" }}>
            {moment(labels[i], "YYYY-MM-DD").format("MMM D")}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

type OutcomeBucket = {
  key: string;
  label: string;
  count: number;
  color: string;
};

function rollupOutcomes(dist: Record<string, number>): OutcomeBucket[] {
  let ok = 0;
  let redirect = 0;
  let client = 0;
  let server = 0;
  for (const [codeStr, count] of Object.entries(dist)) {
    const code = Number(codeStr);
    if (Number.isNaN(code)) continue;
    if (code >= 500) server += count;
    else if (code >= 400) client += count;
    else if (code >= 300) redirect += count;
    else if (code >= 200) ok += count;
  }
  return [
    { key: "2xx", label: "Success (2xx)", count: ok, color: "#059669" },
    { key: "3xx", label: "Redirect (3xx)", count: redirect, color: "#0284c7" },
    { key: "4xx", label: "Client error (4xx)", count: client, color: "#d97706" },
    { key: "5xx", label: "Server error (5xx)", count: server, color: "#dc2626" },
  ].filter((b) => b.count > 0 || b.key === "2xx" || b.key === "4xx" || b.key === "5xx");
}

function OutcomeMix({
  buckets,
  emptyLabel,
}: {
  buckets: OutcomeBucket[];
  emptyLabel: string;
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        {emptyLabel}
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          display: "flex",
          height: 12,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: alpha("#64748b", 0.1),
        }}
      >
        {buckets.map((b) =>
          b.count > 0 ? (
            <Box
              key={b.key}
              title={`${b.label}: ${b.count.toLocaleString()}`}
              sx={{
                width: `${(b.count / total) * 100}%`,
                bgcolor: b.color,
                minWidth: b.count > 0 ? 2 : 0,
              }}
            />
          ) : null,
        )}
      </Box>
      <Stack spacing={1}>
        {buckets.map((b) => {
          const pct = total > 0 ? (b.count / total) * 100 : 0;
          return (
            <Stack key={b.key} direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: b.color, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {b.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {pct.toFixed(1)}%
              </Typography>
              <Typography variant="body2" fontWeight={700} sx={{ minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {b.count.toLocaleString()}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}

function ErrorRate({ analytics }: { analytics: LogsAnalytics }) {
  const total = analytics.summary.totalRequests || 1;
  const err = analytics.summary.clientError4xx + analytics.summary.serverError5xx;
  const rate = (err / total) * 100;
  return (
    <Typography variant="h5" sx={{ fontWeight: 800 }}>
      {rate.toFixed(2)}%
    </Typography>
  );
}

export function DashboardPage() {
  const { selected, isLoading: projectsLoading, error: projectsError } = useProjectWorkspace();
  const timeZoneLabel = useMemo(() => browserTimeZoneLabel(), []);
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);

  const rangeKey = useMemo(() => {
    const to = moment().format("YYYY-MM-DD");
    const from = moment().subtract(rangeDays - 1, "days").format("YYYY-MM-DD");
    return `${from}|${to}|${rangeDays}`;
  }, [rangeDays]);

  const statsQ = useQuery({
    queryKey: selected ? qk.logsStats(selected.id) : ["logs", "stats", "__none"],
    queryFn: () => fetchLogsStats(selected!.apiKey, selected!.environment),
    enabled: !!selected,
  });

  const pathsQ = useQuery({
    queryKey: selected ? qk.logPaths(selected.id) : ["logs", "paths", "__none"],
    queryFn: () => fetchLogPaths(selected!.apiKey, selected!.environment),
    enabled: !!selected,
  });

  const analyticsQ = useQuery({
    queryKey: selected ? qk.logsAnalytics(selected.id, rangeKey) : ["logs", "analytics", "__none"],
    queryFn: () =>
      fetchLogsAnalytics(selected!.apiKey, selected!.environment, {
        days: rangeDays,
      }),
    enabled: !!selected,
  });

  const stats = statsQ.data;
  const paths = pathsQ.data ?? [];
  const analytics = analyticsQ.data;
  const loading = !!selected && (statsQ.isLoading || pathsQ.isLoading);
  const analyticsLoading = !!selected && analyticsQ.isLoading;
  const err =
    statsQ.error instanceof Error
      ? statsQ.error.message
      : pathsQ.error instanceof Error
        ? pathsQ.error.message
        : null;
  const analyticsErr = analyticsQ.error instanceof Error ? analyticsQ.error.message : null;

  const todayOutcomes = useMemo(
    () => rollupOutcomes(stats?.statusCodeDistribution ?? {}),
    [stats],
  );
  const rangeOutcomes = useMemo(() => {
    if (!analytics) return [];
    // Prefer class totals from summary when available (faster / consistent with cards).
    const fromSummary: OutcomeBucket[] = [
      {
        key: "2xx",
        label: "Success (2xx)",
        count: analytics.summary.success2xx,
        color: "#059669",
      },
      {
        key: "4xx",
        label: "Client error (4xx)",
        count: analytics.summary.clientError4xx,
        color: "#d97706",
      },
      {
        key: "5xx",
        label: "Server error (5xx)",
        count: analytics.summary.serverError5xx,
        color: "#dc2626",
      },
    ];
    // Fill 3xx from status distribution if present.
    const rolled = rollupOutcomes(analytics.summary.statusCodeDistribution);
    const redirect = rolled.find((b) => b.key === "3xx");
    if (redirect && redirect.count > 0) {
      return [
        fromSummary[0]!,
        redirect,
        fromSummary[1]!,
        fromSummary[2]!,
      ];
    }
    return fromSummary;
  }, [analytics]);

  const volumeSeries = useMemo(() => {
    const days = analytics?.days ?? [];
    return {
      values: days.map((d) => d.totalRequests),
      labels: days.map((d) => d.date),
      latency: days.map((d) => Math.round(d.avgResponseTimeMs)),
      errors: days.map((d) => d.clientError4xx + d.serverError5xx),
    };
  }, [analytics]);

  useToastOnChange(projectsError, "error");
  useToastOnChange(err, "warning");
  useToastOnChange(analyticsErr, "warning");

  return (
    <Stack spacing={2}>
      <PageHeader title="Overview">
        {selected ? (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={rangeDays}
            onChange={(_e, v: RangeDays | null) => v && setRangeDays(v)}
            sx={{
              "& .MuiToggleButton-root": {
                textTransform: "none",
                px: 1.25,
                py: 0.4,
                fontSize: "0.75rem",
                fontWeight: 700,
              },
            }}
          >
            <ToggleButton value={7}>7d</ToggleButton>
            <ToggleButton value={14}>14d</ToggleButton>
            <ToggleButton value={30}>30d</ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </PageHeader>

      {!projectsLoading && !selected && (
        <Typography variant="body2" color="text.secondary">
          Pick a project in the top bar, or create one under Projects.
        </Typography>
      )}
      {selected && loading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}

      {selected && !loading && stats && (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
            }}
          >
            <StatCard
              title="Logs today"
              value={stats.totalLogs.toLocaleString()}
              subtitle={`Since midnight · ${timeZoneLabel}`}
              icon={<TimelineIcon />}
              accent="#1d4ed8"
            />
            <StatCard
              title="Avg response"
              value={`${Math.round(stats.averageResponseTimeMs)} ms`}
              subtitle={`Since midnight · ${timeZoneLabel}`}
              icon={<TrendingUpIcon />}
              accent="#059669"
            />
            <StatCard
              title="Environment"
              value={stats.environment}
              subtitle="From project key"
              icon={<SettingsSuggestOutlinedIcon />}
              accent="#0f766e"
            />
            <StatCard
              title="Distinct paths"
              value={paths.length.toLocaleString()}
              subtitle={`Logged today · ${timeZoneLabel}`}
              icon={<RouteIcon />}
              accent="#d97706"
            />
          </Box>

          {analyticsLoading && !analytics ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={28} />
            </Box>
          ) : null}

          {analyticsErr && !analytics ? (
            <Typography variant="body2" color="warning.main">
              Analytics unavailable: {analyticsErr}
            </Typography>
          ) : null}

          {analytics ? (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
              }}
            >
              <StatCard
                title={`${rangeDays}d requests`}
                value={analytics.summary.totalRequests.toLocaleString()}
                subtitle={`${analytics.dateFrom} → ${analytics.dateTo}`}
                icon={<TimelineIcon />}
                accent="#2563eb"
              />
              <StatCard
                title={`${rangeDays}d avg latency`}
                value={`${Math.round(analytics.summary.avgResponseTimeMs)} ms`}
                subtitle={`p95 ~ ${Math.round(analytics.summary.p95ResponseTimeMs)} ms`}
                icon={<TrendingUpIcon />}
                accent="#059669"
              />
              <Card sx={{ height: "100%" }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography color="text.secondary" variant="caption" fontWeight={600} gutterBottom display="block">
                    {rangeDays}d error rate
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <ErrorRate analytics={analytics} />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        4xx {analytics.summary.clientError4xx.toLocaleString()} · 5xx{" "}
                        {analytics.summary.serverError5xx.toLocaleString()}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha("#dc2626", 0.12),
                        color: "#dc2626",
                      }}
                    >
                      <WarningAmberIcon />
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
              <StatCard
                title={`${rangeDays}d unique callers`}
                value={analytics.summary.uniqueCallers.toLocaleString()}
                subtitle={`${analytics.summary.uniquePaths.toLocaleString()} unique paths`}
                icon={<RouteIcon />}
                accent="#b45309"
              />
            </Box>
          ) : null}

          {analytics ? (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
              }}
            >
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Request volume ({rangeDays}d · {analytics.timeZone})
                  </Typography>
                  <SparkBars values={volumeSeries.values} labels={volumeSeries.labels} color="#1d4ed8" />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Avg latency ms ({rangeDays}d)
                  </Typography>
                  <SparkBars values={volumeSeries.latency} labels={volumeSeries.labels} color="#059669" />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Errors per day ({rangeDays}d)
                  </Typography>
                  <SparkBars values={volumeSeries.errors} labels={volumeSeries.labels} color="#dc2626" />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Traffic outcomes ({rangeDays}d)
                  </Typography>
                  <OutcomeMix buckets={rangeOutcomes} emptyLabel="No traffic in this range." />
                </CardContent>
              </Card>
            </Box>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            }}
          >
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Today&apos;s outcomes ({timeZoneLabel})
                </Typography>
                <OutcomeMix buckets={todayOutcomes} emptyLabel="No data yet — ingest some logs to see breakdown." />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Top paths ({rangeDays}d)
                </Typography>
                <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
                  {(analytics?.summary.topPaths ?? []).length === 0 && (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
                      No paths recorded yet.
                    </Typography>
                  )}
                  {(analytics?.summary.topPaths ?? []).map((p) => (
                    <ListItem key={p.path} disablePadding sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={p.path}
                        secondary={`${p.count.toLocaleString()} requests`}
                        primaryTypographyProps={{
                          variant: "body2",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.8rem",
                        }}
                        secondaryTypographyProps={{ fontSize: "0.7rem" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Top callers ({rangeDays}d)
                </Typography>
                <List dense sx={{ maxHeight: 280, overflow: "auto" }}>
                  {(analytics?.summary.topCallers ?? []).length === 0 && (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
                      No caller attribution in this range.
                    </Typography>
                  )}
                  {(analytics?.summary.topCallers ?? []).map((c, i) => (
                    <ListItem key={c.callerId ?? `${c.name}-${i}`} disablePadding sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={c.name ?? c.callerId ?? "Unknown"}
                        secondary={`${c.count.toLocaleString()} requests`}
                        primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                        secondaryTypographyProps={{ fontSize: "0.7rem" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Unique paths today ({timeZoneLabel})
                </Typography>
                <List dense sx={{ maxHeight: 280, overflow: "auto" }}>
                  {paths.length === 0 && (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
                      No paths recorded yet.
                    </Typography>
                  )}
                  {paths.slice(0, 40).map((p) => (
                    <ListItem key={p} disablePadding sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={p}
                        primaryTypographyProps={{
                          variant: "body2",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.8rem",
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Stack>
  );
}
