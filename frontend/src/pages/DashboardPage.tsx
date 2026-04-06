import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TimelineIcon from "@mui/icons-material/Timeline";
import RouteIcon from "@mui/icons-material/Route";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchLogPaths, fetchLogsStats } from "../api/client";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { qk } from "../lib/queryKeys";
import { StatusCodeChip } from "../components/StatusCodeChip";
import type { LogsStats } from "../types";

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

export function DashboardPage() {
  const { selected, isLoading: projectsLoading, error: projectsError } = useProjectWorkspace();
  const timeZoneLabel = useMemo(() => browserTimeZoneLabel(), []);

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

  const stats = statsQ.data;
  const paths = pathsQ.data ?? [];
  const loading = !!selected && (statsQ.isLoading || pathsQ.isLoading);
  const err =
    statsQ.error instanceof Error
      ? statsQ.error.message
      : pathsQ.error instanceof Error
        ? pathsQ.error.message
        : null;

  const rows = useMemo(() => distributionRows(stats), [stats]);
  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.count)), [rows]);

  if (projectsError) {
    return <Alert severity="error">{projectsError}</Alert>;
  }

  return (
    <Stack spacing={2}>
      {!projectsLoading && !selected && (
        <Alert severity="info" sx={{ borderRadius: 1 }}>
          Pick a project in the top bar, or create one under <strong>Projects</strong>.
        </Alert>
      )}

      {err && (
        <Alert severity="warning" sx={{ borderRadius: 1 }}>
          {err}
        </Alert>
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
              accent="#7c3aed"
            />
            <StatCard
              title="Distinct paths"
              value={paths.length.toLocaleString()}
              subtitle={`Logged today · ${timeZoneLabel}`}
              icon={<RouteIcon />}
              accent="#d97706"
            />
          </Box>

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
                  Unique paths today ({timeZoneLabel})
                </Typography>
                <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
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
