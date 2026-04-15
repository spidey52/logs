import type { Context } from "hono";
import { z } from "zod";
import type { LogSortField } from "./lib/logsCursor";
import { dayjs } from "./lib/time";

export const environmentSchema = z.enum(["dev", "production"]);

export function queryRecord(c: Context): Record<string, string> {
  const sp = new URL(c.req.url).searchParams;
  const o: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    if (v !== "") o[k] = v;
  }
  return o;
}

export async function parseJson<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const r = schema.safeParse(raw);
  if (!r.success) return c.json({ error: "validation_error", issues: r.error.flatten() }, 400);
  return r.data;
}

export function parseQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.infer<S> | Response {
  const r = schema.safeParse(queryRecord(c));
  if (!r.success) return c.json({ error: "validation_error", issues: r.error.flatten() }, 400);
  return r.data;
}

export const projectCreateBody = z.object({
  name: z.string().trim().min(3),
  description: z.string().default(""),
  environment: environmentSchema,
});

export const projectUpdateBody = z.object({
  name: z.string().trim().min(3),
  description: z.string().default(""),
  environment: environmentSchema,
  isActive: z.boolean().optional(),
});

export const projectListQuery = z.object({
  environment: environmentSchema.optional(),
});

export const callerCreateBody = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  projectId: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const callerUpdateBody = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  email: z.string().email().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const withCountQuery = z
  .enum(["1", "true", "yes", "0", "false", "no"])
  .optional()
  .transform((v) => (v === undefined ? false : v === "1" || v === "true" || v === "yes"));

export const callerListQuery = z
  .object({
    projectId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(5000).optional(),
    withCount: withCountQuery,
    search: z.string().optional(),
  })
  .transform((q) => ({
    projectId: q.projectId,
    cursor: q.cursor,
    limit: q.limit ?? 50,
    withCount: q.withCount,
    search: q.search?.trim() || undefined,
  }));

const logIngestFields = {
  method: z.string().min(1),
  path: z.string().min(1),
  status_code: z.coerce.number().int().min(100).max(599),
  params: z.record(z.string(), z.string()).nullish(),
  query_params: z.record(z.string(), z.string()).nullish(),
  response_time_ms: z.coerce.number().default(0),
  content_length: z.coerce.number().default(0),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  error_message: z.string().default(""),
  caller_id: z.string().uuid().nullish(),
  trace_id: z.string().nullish(),
  span_id: z.string().nullish(),
  service: z.string().nullish(),
  host: z.string().nullish(),
  request_id: z.string().nullish(),
  request_headers: z.record(z.string(), z.unknown()).optional(),
  response_headers: z.record(z.string(), z.unknown()).optional(),
  request_body: z.unknown().optional(),
  response_body: z.unknown().optional(),
};

function normalizeLogIngest(b: z.infer<typeof logIngestRaw>) {
  return {
    method: b.method,
    path: b.path,
    statusCode: b.status_code,
    params: b.params ?? null,
    queryParams: b.query_params ?? null,
    responseTimeMs: b.response_time_ms,
    contentLength: b.content_length,
    ipAddress: b.ip_address,
    userAgent: b.user_agent,
    errorMessage: b.error_message,
    callerId: b.caller_id ?? null,
    traceId: b.trace_id ?? null,
    spanId: b.span_id ?? null,
    service: b.service ?? null,
    host: b.host ?? null,
    requestId: b.request_id ?? null,
    requestHeaders: b.request_headers,
    responseHeaders: b.response_headers,
    requestBody: b.request_body,
    responseBody: b.response_body,
  };
}

const logIngestRaw = z.object(logIngestFields);

export const logIngestBodySchema = logIngestRaw.transform(normalizeLogIngest);

const logBatchItemRaw = z
  .object({
    ...logIngestFields,
    caller_identifier: z.string().optional(),
    caller_name: z.string().optional(),
  })
  .transform((b) => {
    const { caller_identifier, caller_name, ...snake } = b;
    return {
      ...normalizeLogIngest(snake),
      callerIdentifier: caller_identifier,
      callerName: caller_name,
    };
  });

export const logBatchBodySchema = z.object({
  createCallers: z.boolean().optional(),
  logs: z.array(logBatchItemRaw).min(1),
});

const logSortFieldSchema = z.enum([
  "timestamp",
  "method",
  "status_code",
  "response_time_ms",
  "path",
  "caller",
]);

const logSortOrderSchema = z.enum(["asc", "desc"]);

const logsListQueryRaw = z
  .object({
    environment: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
    cursor: z.string().optional(),
    withCount: withCountQuery,
    sort: logSortFieldSchema.optional(),
    order: logSortOrderSchema.optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    search: z.string().optional(),
    traceId: z.string().optional(),
    trace_id: z.string().optional(),
    service: z.string().optional(),
    callerId: z.string().optional(),
    caller_id: z.string().optional(),
    callerIds: z.string().optional(),
    caller_ids: z.string().optional(),
    callerSearch: z.string().optional(),
    caller_search: z.string().optional(),
    statusCode: z.string().optional(),
    statusCodes: z.string().optional(),
    status_codes: z.string().optional(),
    date: z.string().optional(),
    dateRange: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const cis = data.callerIds ?? data.caller_ids;
    if (cis?.trim()) {
      for (const p of cis.split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!z.string().uuid().safeParse(p).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid uuid in callerIds", path: ["callerIds"] });
        }
      }
    }
    const scs = data.statusCodes ?? data.status_codes;
    if (scs?.trim()) {
      for (const p of scs.split(",").map((x) => x.trim()).filter(Boolean)) {
        const n = parseInt(p, 10);
        if (Number.isNaN(n) || n < 100 || n > 599) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid statusCodes", path: ["statusCodes"] });
        }
      }
    }
  });

/** `timeZone` = IANA name from `X-Timezone` (see {@link resolveRequestTimezone}). */
export function buildLogsListQuerySchema(timeZone: string) {
  return logsListQueryRaw.transform((q) => {
    const traceId = q.traceId ?? q.trace_id;
    const callerIdSingle = q.callerId ?? q.caller_id;
    const callerIdsStr = q.callerIds ?? q.caller_ids;
    const callerSearchRaw = q.callerSearch ?? q.caller_search;
    const statusCodesStr = q.statusCodes ?? q.status_codes;

    const filter: {
      environment?: string;
      limit: number;
      cursor?: string;
      withCount: boolean;
      sort: { field: LogSortField; order: "asc" | "desc" };
      method?: string;
      path?: string;
      search?: string;
      traceId?: string;
      service?: string;
      callerId?: string;
      callerIds?: string[];
      callerSearch?: string;
      statusCode?: number;
      statusCodeMin?: number;
      statusCodeMax?: number;
      statusCodes?: number[];
      fromDate?: Date;
      toDate?: Date;
    } = {
      limit: q.limit,
      withCount: q.withCount,
      sort: { field: q.sort ?? "timestamp", order: q.order ?? "desc" },
    };

    if (q.cursor) filter.cursor = q.cursor;
    if (q.environment) filter.environment = q.environment;
    if (q.method) filter.method = q.method;
    if (q.path) filter.path = q.path;
    if (q.search) filter.search = q.search;
    if (traceId) filter.traceId = traceId;
    if (q.service) filter.service = q.service;
    if (callerIdsStr?.trim()) {
      filter.callerIds = [...new Set(callerIdsStr.split(",").map((x) => x.trim()).filter(Boolean))];
    } else if (callerIdSingle) {
      filter.callerId = callerIdSingle;
    }
    if (callerSearchRaw?.trim()) filter.callerSearch = callerSearchRaw.trim();

    if (statusCodesStr?.trim()) {
      const nums = statusCodesStr
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n >= 100 && n <= 599);
      if (nums.length) filter.statusCodes = [...new Set(nums)];
    } else if (q.statusCode) {
      if (q.statusCode.includes("-")) {
        const [a, b] = q.statusCode.split("-").map((x) => parseInt(x.trim(), 10));
        if (!Number.isNaN(a)) filter.statusCodeMin = a;
        if (!Number.isNaN(b)) filter.statusCodeMax = b;
      } else {
        const n = parseInt(q.statusCode, 10);
        if (!Number.isNaN(n)) filter.statusCode = n;
      }
    }

    if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      const from = dayjs.tz(q.date, "YYYY-MM-DD", timeZone);
      if (from.isValid()) {
        filter.fromDate = from.startOf("day").toDate();
        filter.toDate = from.endOf("day").toDate();
      }
    }

    if (q.dateRange) {
      const parts = q.dateRange.split("|");
      if (parts.length === 2) {
        const a = parts[0]!.trim();
        const b = parts[1]!.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
          let from = dayjs.tz(a, "YYYY-MM-DD", timeZone);
          let to = dayjs.tz(b, "YYYY-MM-DD", timeZone);
          if (from.isValid() && to.isValid()) {
            if (from.isAfter(to)) {
              const tmp = from;
              from = to;
              to = tmp;
            }
            filter.fromDate = from.startOf("day").toDate();
            filter.toDate = to.endOf("day").toDate();
          }
        }
      }
    }

    return filter;
  });
}

export const uuidParam = z.string().uuid();
