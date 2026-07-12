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
