import type { LogsFilters } from "../store/uiStore";

export const DEFAULT_PAGE_SIZE = 50;
/** @deprecated use DEFAULT_PAGE_SIZE */
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export const qk = {
  projects: ["projects"] as const,
  health: ["health"] as const,
  logsStats: (projectId: string) => ["logs", "stats", projectId] as const,
  logPaths: (projectId: string) => ["logs", "paths", projectId] as const,
  logsAnalytics: (projectId: string, rangeKey: string) => ["logs", "analytics", projectId, rangeKey] as const,
  slowSummary: (projectId: string, filtersKey: string) => ["logs", "slow-summary", projectId, filtersKey] as const,
  callerSummary: (projectId: string, filtersKey: string) => ["logs", "caller-summary", projectId, filtersKey] as const,
  callersInfinite: (projectId: string) => ["callers", "infinite", projectId] as const,
  logsPage: (projectId: string, filtersKey: string, sortKey: string, pageSize: number, offset: number) =>
    ["logs", "page", projectId, filtersKey, sortKey, pageSize, offset] as const,
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
    excludePathPatterns: [...f.excludePathPatterns].sort(),
  });
}

export function slowFiltersKey(f: {
  dateFrom: string;
  dateTo: string;
  minResponseTimeMs: number;
  methods: string[];
  excludePathPatterns: string[];
  hiddenEndpoints: string[];
}): string {
  return JSON.stringify({
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    minResponseTimeMs: f.minResponseTimeMs,
    methods: [...f.methods].sort(),
    excludePathPatterns: [...f.excludePathPatterns].sort(),
    hiddenEndpoints: [...f.hiddenEndpoints].sort(),
  });
}

/** Server fetch key for slow summary — hide/skip applied client-side. */
export function slowSummaryFetchKey(f: {
  dateFrom: string;
  dateTo: string;
  minResponseTimeMs: number;
  methods: string[];
}): string {
  return JSON.stringify({
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    minResponseTimeMs: f.minResponseTimeMs,
    methods: [...f.methods].sort(),
  });
}

export function callerLogsFiltersKey(f: {
  dateFrom: string;
  dateTo: string;
  methods: string[];
  callerPicks: { id: string }[];
  minResponseTimeMs: number;
}): string {
  return JSON.stringify({
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    methods: [...f.methods].sort(),
    callerIds: [...f.callerPicks.map((c) => c.id)].sort(),
    minResponseTimeMs: f.minResponseTimeMs,
  });
}

/** Fetch key — caller picks filtered client-side. */
export function callerSummaryFetchKey(f: {
  dateFrom: string;
  dateTo: string;
  methods: string[];
  minResponseTimeMs: number;
}): string {
  return JSON.stringify({
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    methods: [...f.methods].sort(),
    minResponseTimeMs: f.minResponseTimeMs,
  });
}

export function logsSortKey(s: { field: string; order: string }): string {
  return JSON.stringify(s);
}
