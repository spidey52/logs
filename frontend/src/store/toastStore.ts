import type { AlertColor } from "@mui/material";
import { createStore } from "@tanstack/store";

export type ToastSeverity = AlertColor;

export type ToastMessage = {
  id: string;
  message: string;
  severity: ToastSeverity;
};

type ToastState = {
  current: ToastMessage | null;
  queue: ToastMessage[];
};

export const toastStore = createStore<ToastState>({
  current: null,
  queue: [],
});

let seq = 0;

function push(message: string, severity: ToastSeverity) {
  const text = message.trim();
  if (!text) return;

  const item: ToastMessage = {
    id: `toast-${++seq}-${Date.now()}`,
    message: text,
    severity,
  };

  toastStore.setState((s) => {
    if (!s.current) return { current: item, queue: s.queue };
    return { current: s.current, queue: [...s.queue, item] };
  });
}

export function dismissToast() {
  toastStore.setState((s) => {
    const [next, ...rest] = s.queue;
    return { current: next ?? null, queue: rest };
  });
}

export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
  info: (message: string) => push(message, "info"),
  warning: (message: string) => push(message, "warning"),
};
