import { createStore } from "@tanstack/store";
import type { Caller } from "../types";

/** Persisted in localStorage — used by TanStack Store only (no React Context). */
export const PROJECT_ID_STORAGE_KEY = "api-logs:selected-project-id";

export type LogsFilters = {
  method: string;
  path: string;
  search: string;
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
  logsWithCount: boolean;
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
  logsWithCount: true,
  logsFilters: { method: "", path: "", search: "", statusCodes: [], callerPicks: [] },
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

export function setLogsWithCount(v: boolean) {
  uiStore.setState((s) => ({ ...s, logsWithCount: v }));
}

export function setLogsFilters(filters: LogsFilters) {
  uiStore.setState((s) => ({ ...s, logsFilters: filters }));
}

export function setLogsSort(sort: LogsSortState) {
  uiStore.setState((s) => ({ ...s, logsSort: sort }));
}
