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
