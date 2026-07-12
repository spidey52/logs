import { createStore } from "@tanstack/store";
import moment from "moment";
import type { Caller } from "../types";

/** Persisted in localStorage — used by TanStack Store only (no React Context). */
export const PROJECT_ID_STORAGE_KEY = "api-logs:selected-project-id";

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
};

export type LogsSortState = {
  field: "timestamp" | "method" | "status_code" | "response_time_ms" | "path" | "caller";
  order: "asc" | "desc";
};

export const defaultLogsSort: LogsSortState = { field: "timestamp", order: "desc" };

export type UiState = {
  selectedProjectId: string | null;
  logsFilters: LogsFilters;
  logsSort: LogsSortState;
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
  },
  logsSort: { ...defaultLogsSort },
});

uiStore.subscribe(() => {
  const id = uiStore.state.selectedProjectId;
  try {
    if (id) localStorage.setItem(PROJECT_ID_STORAGE_KEY, id);
    else localStorage.removeItem(PROJECT_ID_STORAGE_KEY);
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
  uiStore.setState((s) => ({ ...s, logsFilters: { ...s.logsFilters, ...partial } }));
}

export function setLogsSort(sort: LogsSortState) {
  uiStore.setState((s) => ({ ...s, logsSort: sort }));
}
