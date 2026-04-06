export const qk = {
  projects: ["projects"] as const,
  health: ["health"] as const,
  logsStats: (projectId: string) => ["logs", "stats", projectId] as const,
  logPaths: (projectId: string) => ["logs", "paths", projectId] as const,
  callersInfinite: (projectId: string) => ["callers", "infinite", projectId] as const,
  logsInfinite: (projectId: string, filtersKey: string, sortKey: string, withCount: boolean) =>
    ["logs", "infinite", projectId, filtersKey, sortKey, withCount] as const,
  logDetail: (projectId: string, logId: string) => ["logs", "detail", projectId, logId] as const,
};

export function logsFiltersKey(f: { method: string; path: string; search: string; statusCode: string }): string {
  return JSON.stringify(f);
}

export function logsSortKey(s: { field: string; order: string }): string {
  return JSON.stringify(s);
}
