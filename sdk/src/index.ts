/**
 * Core: {@link ApiLogExporter} + types. Peer dependency: **axios** only.
 *
 * Framework middleware (install that framework separately):
 * - `import { apiLogsHonoMiddleware } from "api-logs-sdk/hono"` → peer **hono**
 * - `import { apiLogsExpressMiddleware } from "api-logs-sdk/express"` → peer **express**
 */
export type { ApiLogBatchItem, ApiLogEnvironment } from "./types.js";
export { ApiLogExporter, type ApiLogExporterOptions } from "./exporter.js";
