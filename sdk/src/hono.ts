/**
 * Hono integration. Install **hono** in your app (peer dependency for this entry).
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { ApiLogExporter } from "api-logs-sdk";
 * import { apiLogsHonoMiddleware } from "api-logs-sdk/hono";
 * ```
 */
import type { Context, MiddlewareHandler } from "hono";
import type { ApiLogExporter } from "./exporter.js";
import type { ApiLogBatchItem } from "./types.js";

export type { ApiLogExporter, ApiLogExporterOptions } from "./exporter.js";
export type { ApiLogBatchItem, ApiLogEnvironment } from "./types.js";

export type ApiLogsHonoMiddlewareOptions = {
  exporter: ApiLogExporter;
  getCaller?: (c: Context) => { identifier: string; name: string } | undefined;
  service?: string;
  enrich?: (c: Context, base: ApiLogBatchItem) => ApiLogBatchItem | Promise<ApiLogBatchItem>;
  onEnqueueError?: (err: unknown) => void;
};

function clientIp(c: Context): string | undefined {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  return undefined;
}

export function apiLogsHonoMiddleware(options: ApiLogsHonoMiddlewareOptions): MiddlewareHandler {
  const { exporter, getCaller, service, enrich, onEnqueueError } = options;

  return async (c, next) => {
    const started = performance.now();
    let errMsg = "";
    try {
      await next();
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      const path = c.req.path || new URL(c.req.url).pathname || "/";
      const caller = getCaller?.(c);

      const row: ApiLogBatchItem = {
        method: c.req.method,
        path,
        status_code: c.res.status,
        response_time_ms: durationMs,
        ip_address: clientIp(c),
        user_agent: c.req.header("user-agent") ?? undefined,
        ...(errMsg ? { error_message: errMsg } : {}),
        service: service ?? null,
        host: c.req.header("host") ?? null,
        ...(caller ? { caller_identifier: caller.identifier, caller_name: caller.name } : {}),
      };

      void Promise.resolve(enrich ? enrich(c, row) : row)
        .then((final) => {
          exporter.enqueue(final);
        })
        .catch((err) => {
          onEnqueueError?.(err);
        });
    }
  };
}
