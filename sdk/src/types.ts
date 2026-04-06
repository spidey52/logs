/** Snake_case matches `POST /api/v1/logs/batch` body items. */
export type ApiLogBatchItem = {
  method: string;
  path: string;
  status_code: number;
  response_time_ms?: number;
  content_length?: number;
  ip_address?: string;
  user_agent?: string;
  error_message?: string;
  params?: Record<string, string> | null;
  query_params?: Record<string, string> | null;
  caller_id?: string | null;
  caller_identifier?: string;
  caller_name?: string;
  trace_id?: string | null;
  span_id?: string | null;
  service?: string | null;
  host?: string | null;
  request_id?: string | null;
  request_headers?: Record<string, unknown>;
  response_headers?: Record<string, unknown>;
  request_body?: unknown;
  response_body?: unknown;
};

export type ApiLogEnvironment = "dev" | "production";
