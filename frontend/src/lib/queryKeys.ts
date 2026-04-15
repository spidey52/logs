import type { LogsFilters } from "../store/uiStore";

export const qk = {
  projects: ["projects"] as const,
  health: ["health"] as const,
  logsStats: (projectId: string) => ["logs", "stats", projectId] as const,
  logPaths: (projectId: string) => ["logs", "paths", projectId] as const,
  callersInfinite: (projectId: string) => ["callers", "infinite", projectId] as const,
  callersSearch: (projectId: string, search: string) => ["callers", "search", projectId, search] as const,
  logsInfinite: (projectId: string, filtersKey: string, sortKey: string, withCount: boolean) =>
    ["logs", "infinite", projectId, filtersKey, sortKey, withCount] as const,
  logDetail: (projectId: string, logId: string) => ["logs", "detail", projectId, logId] as const,
};

export function logsFiltersKey(f: LogsFilters): string {
  return JSON.stringify({
    method: f.method,
    path: f.path,
    search: f.search,
    statusCodes: [...f.statusCodes].sort((a, b) => a - b),
    callerIds: [...f.callerPicks.map((c) => c.id)].sort(),
  });
}

export function logsSortKey(s: { field: string; order: string }): string {
  return JSON.stringify(s);
}
