import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import moment from "moment";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { JsonViewer } from "./JsonViewer";
import { MethodChip } from "./MethodChip";
import { StatusCodeChip } from "./StatusCodeChip";
import type { ApiLog, Caller, LogBodiesRow, LogDetailData, LogHeadersRow } from "../types";

export type { LogDetailData };

type LogDetailDialogProps = {
  open: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  data?: LogDetailData | null;
  onRetry?: () => void;
};

function durationTone(ms: number): "success" | "primary" | "warning" | "error" {
  if (ms < 120) return "success";
  if (ms < 400) return "primary";
  if (ms < 1500) return "warning";
  return "error";
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function Field({
  label,
  value,
  mono,
  fullWidth,
  accent,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  fullWidth?: boolean;
  accent?: string;
}) {
  if (!hasValue(value) || value === "—") return null;

  return (
    <Box
      sx={{
        minWidth: 0,
        gridColumn: fullWidth ? "1 / -1" : undefined,
        p: 1.25,
        borderRadius: 1,
        bgcolor: accent ? alpha(accent, 0.08) : alpha("#0f172a", 0.03),
        border: (t) => `1px solid ${accent ? alpha(accent, 0.28) : t.palette.divider}`,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        display="block"
        sx={{ mb: 0.4, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: "0.65rem" }}
      >
        {label}
      </Typography>
      {typeof value === "string" || typeof value === "number" ? (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            wordBreak: "break-word",
            fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" : undefined,
            fontVariantNumeric: "tabular-nums",
            color: accent ?? "text.primary",
          }}
        >
          {value}
        </Typography>
      ) : (
        value
      )}
    </Box>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
      }}
    >
      {items}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 0.5, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function flattenHeaders(headers: LogHeadersRow): { request: Record<string, unknown>; response: Record<string, unknown> } {
  if (!headers) return { request: {}, response: {} };

  const request: Record<string, unknown> = { ...(headers.requestHeadersExtra ?? {}) };
  const response: Record<string, unknown> = { ...(headers.responseHeadersExtra ?? {}) };

  const reqKnown: Array<[string, string | null | undefined]> = [
    ["content-type", headers.requestContentType],
    ["accept", headers.requestAccept],
    ["authorization", headers.requestAuthorization],
    ["origin", headers.requestOrigin],
    ["referer", headers.requestReferer],
    ["x-forwarded-for", headers.requestXForwardedFor],
    ["x-request-id", headers.requestXRequestId],
  ];
  const resKnown: Array<[string, string | null | undefined]> = [
    ["content-type", headers.responseContentType],
    ["cache-control", headers.responseCacheControl],
    ["etag", headers.responseEtag],
    ["location", headers.responseLocation],
    ["x-request-id", headers.responseXRequestId],
  ];

  for (const [k, v] of reqKnown) {
    if (v) request[k] = v;
  }
  for (const [k, v] of resKnown) {
    if (v) response[k] = v;
  }

  return { request, response };
}

function CallerCard({ caller }: { caller: Caller }) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={700}>
        {caller.name}
      </Typography>
      <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }} color="text.secondary">
        {caller.identifier}
      </Typography>
      {caller.email ? (
        <Typography variant="caption" color="text.secondary">
          {caller.email}
        </Typography>
      ) : null}
      {hasValue(caller.metadata) ? (
        <Box sx={{ pt: 0.5 }}>
          <JsonViewer value={caller.metadata} collapsed={1} emptyLabel="" />
        </Box>
      ) : null}
    </Stack>
  );
}

function SummaryTab({ log }: { log: ApiLog }) {
  const caller = log.caller;
  const durationColor =
    log.responseTimeMs < 120 ? "#059669" : log.responseTimeMs < 400 ? "#1d4ed8" : log.responseTimeMs < 1500 ? "#d97706" : "#dc2626";
  const statusColor =
    log.statusCode >= 500 ? "#dc2626" : log.statusCode >= 400 ? "#d97706" : log.statusCode >= 300 ? "#0284c7" : "#059669";

  const hasPathParams = hasValue(log.params);
  const hasQueryParams = hasValue(log.queryParams);
  const hasCallerOrTrace = Boolean(caller || log.traceId || log.spanId || log.requestId);

  const requestFields = [
    <Field key="status" label="Status" value={<StatusCodeChip code={log.statusCode} />} accent={statusColor} />,
    <Field key="duration" label="Duration" value={`${log.responseTimeMs} ms`} accent={durationColor} />,
    log.contentLength ? (
      <Field key="len" label="Content length" value={`${log.contentLength.toLocaleString()} bytes`} />
    ) : null,
    log.host ? <Field key="host" label="Host" value={log.host} mono /> : null,
    log.service ? <Field key="service" label="Service" value={log.service} mono /> : null,
    log.ipAddress ? <Field key="ip" label="IP address" value={log.ipAddress} mono accent="#0284c7" /> : null,
    log.userAgent ? <Field key="ua" label="User agent" value={log.userAgent} fullWidth mono /> : null,
    log.errorMessage ? <Field key="err" label="Error" value={log.errorMessage} fullWidth accent="#dc2626" /> : null,
  ].filter(Boolean);

  const callerTraceFields = [
    caller ? (
      <Field key="caller" label="Caller" value={<CallerCard caller={caller} />} accent="#7c3aed" fullWidth />
    ) : null,
    log.traceId ? <Field key="trace" label="Trace ID" value={log.traceId} mono accent="#7c3aed" /> : null,
    log.spanId ? <Field key="span" label="Span ID" value={log.spanId} mono /> : null,
    log.requestId ? <Field key="req" label="Request ID" value={log.requestId} mono fullWidth /> : null,
  ].filter(Boolean);

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          p: 2,
          borderRadius: 1.5,
          background: `linear-gradient(135deg, ${alpha("#1d4ed8", 0.1)} 0%, ${alpha(statusColor, 0.12)} 100%)`,
          border: `1px solid ${alpha("#1d4ed8", 0.18)}`,
        }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.25 }}>
          <MethodChip method={log.method} />
          <StatusCodeChip code={log.statusCode} />
          <Chip
            label={`${log.responseTimeMs} ms`}
            size="small"
            color={durationTone(log.responseTimeMs)}
            variant="outlined"
            sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
          />
          {log.environment ? (
            <Chip label={log.environment} size="small" variant="outlined" sx={{ fontWeight: 700, textTransform: "capitalize" }} />
          ) : null}
          {caller ? <Chip label={caller.name} size="small" color="secondary" variant="outlined" sx={{ fontWeight: 700 }} /> : null}
        </Stack>
        <Typography
          variant="body1"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontWeight: 700,
            wordBreak: "break-all",
            color: "#0f172a",
          }}
        >
          {log.path}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
          {moment(log.timestamp).format("dddd, MMM D, YYYY · h:mm:ss.SSS A")}
        </Typography>
      </Box>

      {requestFields.length > 0 ? (
        <Section title="Request">
          <FieldGrid>{requestFields}</FieldGrid>
        </Section>
      ) : null}

      {hasCallerOrTrace ? (
        <Section title="Caller & tracing">
          <FieldGrid>{callerTraceFields}</FieldGrid>
        </Section>
      ) : null}

      {hasPathParams || hasQueryParams ? (
        <Section title="Params">
          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: {
                xs: "1fr",
                md: hasPathParams && hasQueryParams ? "1fr 1fr" : "1fr",
              },
            }}
          >
            {hasPathParams ? (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, display: "block" }}>
                  Path params
                </Typography>
                <JsonViewer value={log.params} collapsed={1} />
              </Box>
            ) : null}
            {hasQueryParams ? (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mb: 0.75, display: "block" }}>
                  Query params
                </Typography>
                <JsonViewer value={log.queryParams} collapsed={1} />
              </Box>
            ) : null}
          </Box>
        </Section>
      ) : null}
    </Stack>
  );
}

function BodyTab({ body }: { body: LogBodiesRow }) {
  const hasReq = hasValue(body?.requestBody);
  const hasRes = hasValue(body?.responseBody);

  if (!hasReq && !hasRes) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
        No request or response body captured for this log.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {hasReq ? (
        <Box>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
            Request body
          </Typography>
          <JsonViewer value={body?.requestBody} />
        </Box>
      ) : null}
      {hasReq && hasRes ? <Divider /> : null}
      {hasRes ? (
        <Box>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
            Response body
          </Typography>
          <JsonViewer value={body?.responseBody} />
        </Box>
      ) : null}
    </Stack>
  );
}

function HeadersTab({ headers }: { headers: LogHeadersRow }) {
  const { request, response } = useMemo(() => flattenHeaders(headers), [headers]);
  const hasReq = hasValue(request);
  const hasRes = hasValue(response);

  if (!hasReq && !hasRes) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
        No headers captured for this log.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {hasReq ? (
        <Box>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
            Request headers
          </Typography>
          <JsonViewer value={request} />
        </Box>
      ) : null}
      {hasReq && hasRes ? <Divider /> : null}
      {hasRes ? (
        <Box>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
            Response headers
          </Typography>
          <JsonViewer value={response} />
        </Box>
      ) : null}
    </Stack>
  );
}

export function LogDetailDialog({ open, onClose, loading, error, data, onRetry }: LogDetailDialogProps) {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          height: { xs: "92vh", sm: "min(860px, 90vh)" },
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <DialogTitle sx={{ pr: 6, py: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={800} component="span">
          Log detail
        </Typography>
        {data?.log ? (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, fontFamily: "ui-monospace, monospace" }}>
            {data.log.method} {data.log.path}
          </Typography>
        ) : null}
        <IconButton onClick={onClose} aria-label="close" sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          px: 2,
          minHeight: 42,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 42, textTransform: "none", fontWeight: 700 },
        }}
      >
        <Tab label="Summary" />
        <Tab label="Body" />
        <Tab label="Headers" />
      </Tabs>

      <DialogContent sx={{ p: 2, flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Stack spacing={1} alignItems="flex-start" py={2}>
            <Typography color="error" variant="body2">
              {error}
            </Typography>
            {onRetry ? (
              <Chip label="Retry" onClick={onRetry} clickable color="primary" variant="outlined" size="small" />
            ) : null}
          </Stack>
        )}

        {!loading && !error && data && (
          <>
            {tab === 0 && <SummaryTab log={data.log} />}
            {tab === 1 && <BodyTab body={data.body} />}
            {tab === 2 && <HeadersTab headers={data.headers} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
