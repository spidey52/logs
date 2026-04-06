/**
 * Express integration. Install **express** in your app (peer dependency for this entry).
 *
 * @example
 * ```ts
 * import express from "express";
 * import { ApiLogExporter } from "api-logs-sdk";
 * import { apiLogsExpressMiddleware } from "api-logs-sdk/express";
 * ```
 */
import type { Request, RequestHandler, Response } from "express";
import type { ApiLogExporter } from "./exporter.js";
import type { ApiLogBatchItem } from "./types.js";

export type { ApiLogExporter, ApiLogExporterOptions } from "./exporter.js";
export type { ApiLogBatchItem, ApiLogEnvironment } from "./types.js";

export type ApiLogsExpressMiddlewareOptions = {
  exporter: ApiLogExporter;
  getCaller?: (req: Request) => { identifier: string; name: string } | undefined;
  service?: string;
  enrich?: (req: Request, res: Response, base: ApiLogBatchItem) => ApiLogBatchItem | Promise<ApiLogBatchItem>;
  onEnqueueError?: (err: unknown) => void;
};

function clientIp(req: Request): string | undefined {
  const xff = req.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = req.get("cf-connecting-ip");
  if (cf) return cf;
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return socketIp;
  return undefined;
}

/**
 * Logs each HTTP request when the response finishes (`res` "finish" event).
 */
export function apiLogsExpressMiddleware(options: ApiLogsExpressMiddlewareOptions): RequestHandler {
  const { exporter, getCaller, service, enrich, onEnqueueError } = options;

  return (req, res, next) => {
    const started = performance.now();
    let sent = false;

    const onDone = () => {
      if (sent) return;
      sent = true;
      res.removeListener("finish", onDone);
      res.removeListener("close", onDone);

      const durationMs = Math.max(0, Math.round(performance.now() - started));
      const path = req.path || (req.url ? req.url.split("?")[0] : "") || "/";
      const status = res.statusCode;
      const caller = getCaller?.(req);

      const row: ApiLogBatchItem = {
        method: req.method,
        path,
        status_code: status,
        response_time_ms: durationMs,
        ip_address: clientIp(req),
        user_agent: req.get("user-agent") ?? undefined,
        service: service ?? null,
        host: req.get("host") ?? null,
        ...(caller ? { caller_identifier: caller.identifier, caller_name: caller.name } : {}),
      };

      void Promise.resolve(enrich ? enrich(req, res, row) : row)
        .then((final) => {
          exporter.enqueue(final);
        })
        .catch((err) => {
          onEnqueueError?.(err);
        });
    };

    res.once("finish", onDone);
    res.once("close", onDone);

    next();
  };
}
