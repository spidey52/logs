export type Environment = "dev" | "production";

export type Project = {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  environment: Environment;
  isActive: boolean;
  createdAt: string;
};

export type Caller = {
  id: string;
  projectId: string;
  name: string;
  identifier: string;
  email: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ApiLog = {
  id: string;
  projectId: string;
  environment: string;
  method: string;
  path: string;
  params: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  statusCode: number;
  responseTimeMs: number;
  contentLength: number;
  ipAddress: string;
  userAgent: string;
  errorMessage: string;
  callerId: string | null;
  traceId: string | null;
  spanId: string | null;
  service: string | null;
  host: string | null;
  requestId: string | null;
  timestamp: string;
  caller?: Caller;
};

export type LogsStats = {
  totalLogs: number;
  statusCodeDistribution: Record<string, number>;
  averageResponseTimeMs: number;
  environment: string;
  projectId: string;
};

export type AnalyticsDay = {
  date: string;
  totalRequests: number;
  success2xx: number;
  clientError4xx: number;
  serverError5xx: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  uniquePaths: number;
  uniqueCallers: number;
  statusCodeDistribution: Record<string, number>;
  methodDistribution: Record<string, number>;
  topPaths: { path: string; count: number }[];
  topCallers: { callerId: string | null; name: string | null; count: number }[];
  source: "analytics" | "live";
};

export type LogsAnalytics = {
  dateFrom: string;
  dateTo: string;
  timeZone: string;
  summary: {
    totalRequests: number;
    success2xx: number;
    clientError4xx: number;
    serverError5xx: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    uniquePaths: number;
    uniqueCallers: number;
    statusCodeDistribution: Record<string, number>;
    methodDistribution: Record<string, number>;
    topPaths: { path: string; count: number }[];
    topCallers: { callerId: string | null; name: string | null; count: number }[];
  };
  days: AnalyticsDay[];
};

export type SlowBuckets = {
  b500: number;
  b1000: number;
  b2000: number;
  b5000: number;
};

export type SlowEndpointRow = {
  path: string;
  pattern: string;
  total: number;
  slow: number;
  slowPct: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  buckets: SlowBuckets;
};

export type SlowPatternRow = {
  pattern: string;
  total: number;
  slow: number;
  slowPct: number;
  endpoints: number;
  buckets: SlowBuckets;
};

export type SlowSummary = {
  thresholdMs: number;
  totalRequests: number;
  slowRequests: number;
  totalEndpoints: number;
  slowEndpoints: number;
  buckets: SlowBuckets;
  endpoints: SlowEndpointRow[];
  patterns: SlowPatternRow[];
};

export type CallerSummaryRow = {
  callerId: string;
  name: string;
  identifier: string;
  total: number;
  slow: number;
  slowPct: number;
  error4xx: number;
  error5xx: number;
  uniquePaths: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
};

export type CallerSummary = {
  thresholdMs: number;
  totalRequests: number;
  slowRequests: number;
  error4xx: number;
  error5xx: number;
  callerCount: number;
  avgMs: number;
  p95Ms: number;
  callers: CallerSummaryRow[];
};

export type LogHeadersRow = {
  id?: string;
  logId?: string;
  requestContentType?: string | null;
  requestAccept?: string | null;
  requestAuthorization?: string | null;
  requestOrigin?: string | null;
  requestReferer?: string | null;
  requestXForwardedFor?: string | null;
  requestXRequestId?: string | null;
  responseContentType?: string | null;
  responseCacheControl?: string | null;
  responseEtag?: string | null;
  responseLocation?: string | null;
  responseXRequestId?: string | null;
  requestHeadersExtra?: Record<string, unknown>;
  responseHeadersExtra?: Record<string, unknown>;
  createdAt?: string;
} | null;

export type LogBodiesRow = {
  id?: string;
  logId?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  createdAt?: string;
} | null;

export type LogDetailData = {
  log: ApiLog;
  headers: LogHeadersRow;
  body: LogBodiesRow;
};
