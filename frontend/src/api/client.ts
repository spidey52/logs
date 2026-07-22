import axios, { type AxiosError } from "axios";
import type { ApiLog, Caller, Environment, LogDetailData, LogsAnalytics, LogsStats, Project } from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string }>) => {
    const body = err.response?.data;
    const fromApi =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    const message = fromApi || err.response?.statusText || err.message || "Request failed";
    return Promise.reject(new Error(message));
  },
);

function clientTimezoneHeader(): Record<string, string> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? { "X-Timezone": tz } : {};
  } catch {
    return {};
  }
}

function logHeaders(apiKey: string, environment: Environment): Record<string, string> {
  return {
    ...clientTimezoneHeader(),
    "X-API-Key": apiKey,
    "X-Environment": environment,
  };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const { data } = await api.get<{ ok?: boolean }>("/health");
    return data?.ok === true;
  } catch {
    return false;
  }
}

export async function listProjects(env?: Environment): Promise<Project[]> {
  const { data } = await api.get<{ data: Project[] }>("/api/v1/projects", {
    params: env ? { environment: env } : undefined,
  });
  return data.data;
}

export async function createProject(body: {
  name: string;
  description?: string;
  environment: Environment;
}): Promise<Project> {
  const { data } = await api.post<{ data: Project }>("/api/v1/projects", body);
  return data.data;
}

export async function updateProject(
  id: string,
  body: { name: string; description?: string; environment: Environment; isActive?: boolean },
): Promise<Project> {
  const { data } = await api.put<{ data: Project }>(`/api/v1/projects/${id}`, body);
  return data.data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/api/v1/projects/${id}`);
}

export async function regenerateProjectKey(id: string): Promise<string> {
  const { data } = await api.post<{ data: { apiKey: string } }>(`/api/v1/projects/${id}/regenerate-key`);
  return data.data.apiKey;
}

export async function listCallers(opts?: {
  projectId?: string;
  cursor?: string;
  limit?: number;
  withCount?: boolean;
  /** Substring match on caller name or identifier */
  search?: string;
}): Promise<{ data: Caller[]; nextCursor: string | null; total: number | null }> {
  const { data } = await api.get("/api/v1/callers", {
    params: {
      projectId: opts?.projectId,
      cursor: opts?.cursor,
      limit: opts?.limit,
      search: opts?.search?.trim() || undefined,
      ...(opts?.withCount ? { withCount: "true" } : {}),
    },
  });
  return data;
}

export async function createCaller(body: {
  name: string;
  identifier: string;
  projectId: string;
  email?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Caller> {
  const { data } = await api.post<{ data: Caller }>("/api/v1/callers", body);
  return data.data;
}

export async function updateCaller(
  id: string,
  body: { name: string; identifier: string; email?: string | null; metadata?: Record<string, unknown> },
): Promise<Caller> {
  const { data } = await api.put<{ data: Caller }>(`/api/v1/callers/${id}`, body);
  return data.data;
}

export async function deleteCaller(id: string): Promise<void> {
  await api.delete(`/api/v1/callers/${id}`);
}

export async function fetchLogsStats(apiKey: string, environment: Environment): Promise<LogsStats> {
  const { data } = await api.get<{ data: LogsStats }>("/api/v1/logs/stats", {
    headers: logHeaders(apiKey, environment),
  });
  return data.data;
}

export async function fetchLogPaths(apiKey: string, environment: Environment): Promise<string[]> {
  const { data } = await api.get<{ data: string[] }>("/api/v1/logs/paths", {
    headers: logHeaders(apiKey, environment),
  });
  return data.data;
}

export async function fetchLogsAnalytics(
  apiKey: string,
  environment: Environment,
  params?: { dateFrom?: string; dateTo?: string; days?: number },
): Promise<LogsAnalytics> {
  const { data } = await api.get<{ data: LogsAnalytics }>("/api/v1/logs/analytics", {
    headers: logHeaders(apiKey, environment),
    params: {
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo,
      days: params?.days,
    },
  });
  return data.data;
}

export async function listLogs(
  apiKey: string,
  environment: Environment,
  params: Record<string, string | number | undefined>,
): Promise<{ data: ApiLog[]; total: number | null; limit: number; offset: number }> {
  const query: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") query[k] = v;
  }
  const { data } = await api.get("/api/v1/logs", {
    headers: logHeaders(apiKey, environment),
    params: query,
  });
  return data;
}

export async function countLogs(
  apiKey: string,
  environment: Environment,
  params: Record<string, string | number | undefined>,
): Promise<number> {
  const query: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") query[k] = v;
  }
  const { data } = await api.get<{ data: { total: number } }>("/api/v1/logs/count", {
    headers: logHeaders(apiKey, environment),
    params: query,
  });
  return data.data.total;
}

export async function fetchLogDetail(
  apiKey: string,
  environment: Environment,
  id: string,
): Promise<LogDetailData> {
  const { data } = await api.get<{ data: LogDetailData }>(`/api/v1/logs/${id}/details`, {
    headers: logHeaders(apiKey, environment),
  });
  return data.data;
}
