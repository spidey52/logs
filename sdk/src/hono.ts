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

      let requestBody: unknown;

      try {
        requestBody = await c.req.json();
      } catch {
        requestBody = undefined;
      }

      const row: ApiLogBatchItem = {
        method: c.req.method,
        path,
        status_code: c.res.status,
        params: c.req.param(),
        query_params: c.req.query(),
        request_headers: c.req.header(),
        request_id: c.req.header("x-request-id") ?? undefined,
        response_time_ms: durationMs,
        ip_address: clientIp(c),
        user_agent: c.req.header("user-agent") ?? undefined,
        service: service ?? null,
        host: c.req.header("host") ?? null,
        request_body: requestBody,

        ...(errMsg ? { error_message: errMsg } : {}),
        ...(caller ? { caller_identifier: caller.identifier, caller_name: caller.name, } : {}),
      };

      const contentLength = c.res.headers.get("content-length");

      if (contentLength) {
        row.content_length = parseInt(contentLength);
      }

      // if status is not success, set response_body
      const clonedRes = c.res.clone();
      if (clonedRes.status >= 400) {
        try {
          row.response_body = await clonedRes.json();
        } catch {
          try {
            // row.response_body = await c.res.text();
            const textBody = await clonedRes.text();
            row.response_body = { text: textBody, }
          } catch (error) {
            console.error(error);
            row.response_body = { error: "failed_to_parse_response_body" };
          }
        }
      }


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
