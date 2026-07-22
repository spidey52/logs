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
  LinearProgress,
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
import { StatusCodeChip } from "../components/StatusCodeChip";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useToastOnChange } from "../hooks/useToastOnChange";
import { qk } from "../lib/queryKeys";
import type { LogsAnalytics, LogsStats } from "../types";

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

function distributionRows(stats: LogsStats | null | undefined) {
  if (!stats) return [];
  return Object.entries(stats.statusCodeDistribution)
    .map(([code, count]) => ({ code: Number(code), count }))
    .filter((r) => !Number.isNaN(r.code))
    .sort((a, b) => a.code - b.code);
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

function MethodBars({ dist }: { dist: Record<string, number> }) {
  const rows = Object.entries(dist)
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) {
    return (
      <Typography color="text.secondary" variant="body2">
        No method data in this range.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25}>
      {rows.map(({ method, count }) => (
        <Stack key={method} direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="body2" fontWeight={700} sx={{ minWidth: 56, fontFamily: "ui-monospace, monospace" }}>
            {method}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={(count / max) * 100}
              sx={{
                height: 8,
                borderRadius: 1,
                bgcolor: alpha("#64748b", 0.12),
                "& .MuiLinearProgress-bar": { borderRadius: 1, bgcolor: "#1d4ed8" },
              }}
            />
          </Box>
          <Typography variant="body2" fontWeight={700} sx={{ minWidth: 56, textAlign: "right" }}>
            {count.toLocaleString()}
          </Typography>
        </Stack>
      ))}
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
  const loading = !!selected && (statsQ.isLoading || pathsQ.isLoading || analyticsQ.isLoading);
  const err =
    statsQ.error instanceof Error
      ? statsQ.error.message
      : pathsQ.error instanceof Error
        ? pathsQ.error.message
        : analyticsQ.error instanceof Error
          ? analyticsQ.error.message
          : null;

  const rows = useMemo(() => distributionRows(stats), [stats]);
  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows]);

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
              subtitle="Same window as distribution"
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
                    Methods ({rangeDays}d)
                  </Typography>
                  <MethodBars dist={analytics.summary.methodDistribution} />
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
                  Status distribution for today ({timeZoneLabel})
                </Typography>
                <Stack spacing={1.5}>
                  {rows.length === 0 && (
                    <Typography color="text.secondary" variant="body2">
                      No data yet — ingest some logs to see breakdown.
                    </Typography>
                  )}
                  {rows.map(({ code, count }) => (
                    <Stack key={code} direction="row" alignItems="center" spacing={1.5}>
                      <StatusCodeChip code={code} size="small" />
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={(count / maxCount) * 100}
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            bgcolor: alpha("#64748b", 0.12),
                            "& .MuiLinearProgress-bar": {
                              borderRadius: 1,
                              bgcolor:
                                code >= 500
                                  ? "error.main"
                                  : code >= 400
                                    ? "warning.main"
                                    : code >= 300
                                      ? "info.main"
                                      : "success.main",
                            },
                          }}
                        />
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 48, textAlign: "right" }}>
                        {count}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
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
