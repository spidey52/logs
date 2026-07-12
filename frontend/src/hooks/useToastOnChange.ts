import { useEffect, useRef } from "react";
import { toast } from "../store/toastStore";

/** Fire a toast when `message` becomes a new non-empty string. */
export function useToastOnChange(
  message: string | null | undefined,
  severity: "error" | "warning" | "info" | "success" = "error",
) {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const next = message?.trim() || null;
    if (next && next !== prev.current) {
      toast[severity](next);
    }
    prev.current = next;
  }, [message, severity]);
}
