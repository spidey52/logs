import type { LogsFilters } from "../store/uiStore";

export const PAGE_SIZE = 50;

export const qk = {
  projects: ["projects"] as const,
  health: ["health"] as const,
  logsStats: (projectId: string) => ["logs", "stats", projectId] as const,
  logPaths: (projectId: string) => ["logs", "paths", projectId] as const,
  logsAnalytics: (projectId: string, rangeKey: string) => ["logs", "analytics", projectId, rangeKey] as const,
  callersInfinite: (projectId: string) => ["callers", "infinite", projectId] as const,
  logsPage: (projectId: string, filtersKey: string, sortKey: string, offset: number) =>
    ["logs", "page", projectId, filtersKey, sortKey, offset] as const,
  logDetail: (projectId: string, logId: string) => ["logs", "detail", projectId, logId] as const,
};

export function logsFiltersKey(f: LogsFilters): string {
  return JSON.stringify({
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    methods: [...f.methods].sort(),
    search: f.search,
    searchFields: [...f.searchFields].sort(),
    statusCodes: [...f.statusCodes].sort((a, b) => a - b),
    callerIds: [...f.callerPicks.map((c) => c.id)].sort(),
  });
}

export function logsSortKey(s: { field: string; order: string }): string {
  return JSON.stringify(s);
}
