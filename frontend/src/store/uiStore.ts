import { createStore } from "@tanstack/store";
import moment from "moment";
import type { Caller } from "../types";

/** Persisted in localStorage — used by TanStack Store only (no React Context). */
export const PROJECT_ID_STORAGE_KEY = "api-logs:selected-project-id";
export const EXCLUDE_PATH_PATTERNS_STORAGE_KEY = "api-logs:exclude-path-patterns";
export const HIDDEN_ENDPOINTS_STORAGE_KEY = "api-logs:hidden-endpoints";
/** @deprecated migrated into EXCLUDE_PATH_PATTERNS_STORAGE_KEY */
const LEGACY_EXCLUDE_PATH_PREFIXES_STORAGE_KEY = "api-logs:exclude-path-prefixes";
/** @deprecated migrated into EXCLUDE_PATH_PATTERNS_STORAGE_KEY */
const LEGACY_EXCLUDE_PATHS_STORAGE_KEY = "api-logs:exclude-paths";

/** Strip optional surrounding `*` — matching is always contains (`*pattern*`). */
export function normalizeSkipPattern(raw: string): string {
  return raw.trim().replace(/^\*+/, "").replace(/\*+$/, "").trim();
}

function readPersistedExcludePathPatterns(): string[] {
  try {
    const raw =
      localStorage.getItem(EXCLUDE_PATH_PATTERNS_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_EXCLUDE_PATH_PREFIXES_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_EXCLUDE_PATHS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((p): p is string => typeof p === "string")
          .map(normalizeSkipPattern)
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function readPersistedHiddenEndpoints(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_ENDPOINTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(parsed.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())),
    ];
  } catch {
    return [];
  }
}

/** `internal` / `*internal*` matches any path containing that substring (case-insensitive). */
export function pathMatchesSkipPattern(path: string, pattern: string): boolean {
  const p = normalizeSkipPattern(pattern);
  if (!p) return false;
  return path.toLowerCase().includes(p.toLowerCase());
}

/** Prefer first path segment so one click skips a family (e.g. `/internal/cron/x` → `/internal`). */
export function suggestSkipPattern(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 1) return `/${parts[0]}`;
  return normalizeSkipPattern(path);
}

export type LogSearchField = "path" | "ip" | "userAgent" | "error" | "host" | "service" | "requestId" | "traceId";

export const DEFAULT_LOG_SEARCH_FIELDS: LogSearchField[] = ["path", "ip", "userAgent"];

export const LOG_SEARCH_FIELD_OPTIONS: { value: LogSearchField; label: string }[] = [
  { value: "path", label: "Path" },
  { value: "ip", label: "IP address" },
  { value: "userAgent", label: "User agent" },
  { value: "error", label: "Error" },
  { value: "host", label: "Host" },
  { value: "service", label: "Service" },
  { value: "requestId", label: "Request ID" },
  { value: "traceId", label: "Trace ID" },
];

export const LOG_METHOD_OPTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type LogsFilters = {
  /** YYYY-MM-DD inclusive range start */
  dateFrom: string;
  /** YYYY-MM-DD inclusive range end (same as dateFrom for a single day) */
  dateTo: string;
  /** UI preference for the date picker */
  dateMode: "single" | "range";
  methods: string[];
  search: string;
  searchFields: LogSearchField[];
  statusCodes: number[];
  /** Selected callers; API query uses their ids as `callerIds`. */
  callerPicks: Caller[];
  /** Substring patterns to omit (`*pattern*` — matches anywhere in the path). */
  excludePathPatterns: string[];
};

export type LogsSortState = {
  field: "timestamp" | "method" | "status_code" | "response_time_ms" | "path" | "caller";
  order: "asc" | "desc";
};

export const defaultLogsSort: LogsSortState = { field: "timestamp", order: "desc" };

export type SlowFilters = {
  dateFrom: string;
  dateTo: string;
  dateMode: "single" | "range";
  /** Only show requests at or above this duration (ms). */
  minResponseTimeMs: number;
  methods: string[];
  /** Substring patterns to omit (`*pattern*`). */
  excludePathPatterns: string[];
  /** Exact endpoints hidden from the slow summary. */
  hiddenEndpoints: string[];
};

export type CallerLogsFilters = {
  dateFrom: string;
  dateTo: string;
  dateMode: "single" | "range";
  methods: string[];
  callerPicks: Caller[];
  /** Threshold used for "slow" in the caller summary. */
  minResponseTimeMs: number;
};

export const DEFAULT_SLOW_MIN_MS = 1000;

export function defaultSlowFilters(): SlowFilters {
  const day = moment().format("YYYY-MM-DD");
  return {
    dateFrom: day,
    dateTo: day,
    dateMode: "single",
    minResponseTimeMs: DEFAULT_SLOW_MIN_MS,
    methods: [],
    excludePathPatterns: readPersistedExcludePathPatterns(),
    hiddenEndpoints: readPersistedHiddenEndpoints(),
  };
}

export function defaultCallerLogsFilters(): CallerLogsFilters {
  const day = moment().format("YYYY-MM-DD");
  return {
    dateFrom: day,
    dateTo: day,
    dateMode: "single",
    methods: [],
    callerPicks: [],
    minResponseTimeMs: DEFAULT_SLOW_MIN_MS,
  };
}

export type UiState = {
  selectedProjectId: string | null;
  logsFilters: LogsFilters;
  logsSort: LogsSortState;
  slowFilters: SlowFilters;
  callerLogsFilters: CallerLogsFilters;
};

export function readPersistedProjectId(): string | null {
  try {
    return localStorage.getItem(PROJECT_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Global UI state via TanStack Store (`createStore`).
 * @see https://tanstack.com/store/latest/docs/framework/react/quick-start
 */
export const uiStore = createStore<UiState>({
  selectedProjectId: readPersistedProjectId(),
  logsFilters: {
    dateFrom: moment().format("YYYY-MM-DD"),
    dateTo: moment().format("YYYY-MM-DD"),
    dateMode: "single",
    methods: [],
    search: "",
    searchFields: [...DEFAULT_LOG_SEARCH_FIELDS],
    statusCodes: [],
    callerPicks: [],
    excludePathPatterns: readPersistedExcludePathPatterns(),
  },
  logsSort: { ...defaultLogsSort },
  slowFilters: defaultSlowFilters(),
  callerLogsFilters: defaultCallerLogsFilters(),
});

uiStore.subscribe(() => {
  const id = uiStore.state.selectedProjectId;
  const excludePathPatterns = uiStore.state.logsFilters.excludePathPatterns;
  const hiddenEndpoints = uiStore.state.slowFilters.hiddenEndpoints;
  try {
    if (id) localStorage.setItem(PROJECT_ID_STORAGE_KEY, id);
    else localStorage.removeItem(PROJECT_ID_STORAGE_KEY);
    localStorage.setItem(EXCLUDE_PATH_PATTERNS_STORAGE_KEY, JSON.stringify(excludePathPatterns));
    localStorage.setItem(HIDDEN_ENDPOINTS_STORAGE_KEY, JSON.stringify(hiddenEndpoints));
    localStorage.removeItem(LEGACY_EXCLUDE_PATH_PREFIXES_STORAGE_KEY);
    localStorage.removeItem(LEGACY_EXCLUDE_PATHS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

export function setSelectedProjectId(id: string | null) {
  uiStore.setState((s) => ({ ...s, selectedProjectId: id }));
}

export function setLogsFilters(filters: LogsFilters) {
  uiStore.setState((s) => ({ ...s, logsFilters: filters }));
}

export function patchLogsFilters(partial: Partial<LogsFilters>) {
  uiStore.setState((s) => {
    const logsFilters = { ...s.logsFilters, ...partial };
    // Keep skip patterns shared when updated from logs page.
    const slowFilters =
      partial.excludePathPatterns != null
        ? { ...s.slowFilters, excludePathPatterns: partial.excludePathPatterns }
        : s.slowFilters;
    return { ...s, logsFilters, slowFilters };
  });
}

export function patchSlowFilters(partial: Partial<SlowFilters>) {
  uiStore.setState((s) => {
    const slowFilters = { ...s.slowFilters, ...partial };
    const logsFilters =
      partial.excludePathPatterns != null
        ? { ...s.logsFilters, excludePathPatterns: partial.excludePathPatterns }
        : s.logsFilters;
    return { ...s, slowFilters, logsFilters };
  });
}

export function patchCallerLogsFilters(partial: Partial<CallerLogsFilters>) {
  uiStore.setState((s) => ({
    ...s,
    callerLogsFilters: { ...s.callerLogsFilters, ...partial },
  }));
}

export function setLogsSort(sort: LogsSortState) {
  uiStore.setState((s) => ({ ...s, logsSort: sort }));
}
