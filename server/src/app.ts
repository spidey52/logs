import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db } from "./db";
import { apiLogBodies, apiLogHeaders, apiLogs, callers, projects } from "./db/schema";
import { newApiKey } from "./lib/apiKey";
import { decodeCursor } from "./lib/cursor";
import { clientIp } from "./lib/http";
import { newId } from "./lib/ids";
import { partitionLogHeaders } from "./lib/logHeaders";
import { now, resolveRequestTimezone } from "./lib/time";
import { queryCallersPage } from "./services/callerQueries";
import {
  averageResponseTime,
  countLogs,
  countLogsSinceStartOfDay,
  distinctPaths,
  queryCallerSummary,
  queryLogsPage,
  querySlowSummary,
  statusCodeDistribution as fetchStatusCodeDistribution,
  type LogFilter,
  type LogListSort,
} from "./services/logQueries";
import { queryAnalyticsRange, analyticsTimezone } from "./jobs/pruneAnalytics";
import {
  buildLogsListQuerySchema,
  callerCreateBody,
  callerListQuery,
  callerUpdateBody,
  environmentSchema,
  logBatchBodySchema,
  logIngestBodySchema,
  parseJson,
  parseQuery,
  projectCreateBody,
  projectListQuery,
  projectUpdateBody,
  uuidParam,
} from "./validation";
import { z } from "zod";
import { moment } from "./lib/time";

async function insertLogExtras(
  logId: string,
  b: {
    requestHeaders?: Record<string, unknown>;
    responseHeaders?: Record<string, unknown>;
    requestBody?: unknown;
    responseBody?: unknown;
  },
): Promise<void> {
  const p = partitionLogHeaders(b.requestHeaders, b.responseHeaders);
  if (p.hasAny) {
    await db.insert(apiLogHeaders).values({
      id: newId(),
      logId,
      ...p.columns,
      requestHeadersExtra: p.requestHeadersExtra,
      responseHeadersExtra: p.responseHeadersExtra,
      createdAt: now(),
    });
  }
  if (b.requestBody != null) {
    await db.insert(apiLogBodies).values({
      id: newId(),
      logId,
      requestBody: b.requestBody,
      responseBody: b.responseBody ?? null,
      createdAt: now(),
    });
  } else if (b.responseBody != null) {
    await db.insert(apiLogBodies).values({
      id: newId(),
      logId,
      requestBody: null,
      responseBody: b.responseBody,
      createdAt: now(),
    });
  }
}

async function assertCaller(projectId: string, callerId: string | null): Promise<string | null> {
  if (!callerId) return null;
  const [row] = await db
    .select({ id: callers.id })
    .from(callers)
    .where(and(eq(callers.id, callerId), eq(callers.projectId, projectId)))
    .limit(1);
  return row?.id ?? null;
}

export function createApp() {
  const app = new Hono();
  app.use(logger());

  app.use(
    "*",
    cors({
      origin: "*",
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "X-API-Key",
        "X-Environment",
        "X-Timezone",
        "X-Requested-With",
        "Authorization",
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  const v1 = new Hono();

  v1.post("/projects", async (c) => {
    const parsed = await parseJson(c, projectCreateBody);
    if (parsed instanceof Response) return parsed;

    const id = newId();
    const t = now();
    let key = newApiKey();
    for (let i = 0; i < 5; i++) {
      const exists = await db.select({ id: projects.id }).from(projects).where(eq(projects.apiKey, key)).limit(1);
      if (!exists.length) break;
      key = newApiKey();
    }
    const row = {
      id,
      name: parsed.name,
      description: parsed.description,
      apiKey: key,
      environment: parsed.environment,
      isActive: true,
      createdAt: t,
    };
    await db.insert(projects).values(row);
    return c.json({ data: row }, 201);
  });

  v1.get("/projects", async (c) => {
    const q = parseQuery(c, projectListQuery);
    if (q instanceof Response) return q;
    const where = q.environment ? eq(projects.environment, q.environment) : undefined;
    const rows = await db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(100);
    return c.json({ data: rows });
  });

  v1.get("/projects/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const [row] = await db.select().from(projects).where(eq(projects.id, idParse.data)).limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ data: row });
  });

  v1.put("/projects/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const id = idParse.data;
    const parsed = await parseJson(c, projectUpdateBody);
    if (parsed instanceof Response) return parsed;

    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);
    await db
      .update(projects)
      .set({
        name: parsed.name,
        description: parsed.description,
        environment: parsed.environment,
        isActive: parsed.isActive ?? existing.isActive,
      })
      .where(eq(projects.id, id));
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return c.json({ data: row });
  });

  v1.delete("/projects/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const del = await db.delete(projects).where(eq(projects.id, idParse.data)).returning({ id: projects.id });
    if (!del.length) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  v1.post("/projects/:id/regenerate-key", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const id = idParse.data;
    const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);
    let key = newApiKey();
    for (let i = 0; i < 8; i++) {
      const clash = await db.select({ id: projects.id }).from(projects).where(eq(projects.apiKey, key)).limit(1);
      if (!clash.length) break;
      key = newApiKey();
    }
    await db.update(projects).set({ apiKey: key }).where(eq(projects.id, id));
    return c.json({ data: { apiKey: key } });
  });

  v1.post("/callers", async (c) => {
    const parsed = await parseJson(c, callerCreateBody);
    if (parsed instanceof Response) return parsed;

    const [dup] = await db
      .select()
      .from(callers)
      .where(and(eq(callers.identifier, parsed.identifier), eq(callers.projectId, parsed.projectId)))
      .limit(1);
    if (dup) return c.json({ error: "duplicate_identifier" }, 409);
    const t = now();
    const row = {
      id: newId(),
      projectId: parsed.projectId,
      name: parsed.name,
      identifier: parsed.identifier,
      email: parsed.email ?? null,
      metadata: parsed.metadata,
      createdAt: t,
    };
    await db.insert(callers).values(row);
    return c.json({ data: row }, 201);
  });

  v1.get("/callers", async (c) => {
    const q = parseQuery(c, callerListQuery);
    if (q instanceof Response) return q;
    let cursor: { at: Date; id: string } | null = null;
    if (q.cursor) {
      cursor = decodeCursor(q.cursor);
      if (!cursor) return c.json({ error: "validation_error", issues: { formErrors: [], fieldErrors: { cursor: ["invalid"] } } }, 400);
    }
    const { rows, nextCursor, total } = await queryCallersPage({
      projectId: q.projectId,
      limit: q.limit,
      cursor,
      withCount: q.withCount,
      search: q.search,
    });
    return c.json({ data: rows, nextCursor, total });
  });

  v1.get("/callers/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const [row] = await db.select().from(callers).where(eq(callers.id, idParse.data)).limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ data: row });
  });

  v1.put("/callers/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const id = idParse.data;
    const parsed = await parseJson(c, callerUpdateBody);
    if (parsed instanceof Response) return parsed;

    const [existing] = await db.select().from(callers).where(eq(callers.id, id)).limit(1);
    if (!existing) return c.json({ error: "not_found" }, 404);
    const [other] = await db
      .select()
      .from(callers)
      .where(and(eq(callers.identifier, parsed.identifier), eq(callers.projectId, existing.projectId)))
      .limit(1);
    if (other && other.id !== id) return c.json({ error: "duplicate_identifier" }, 409);
    await db
      .update(callers)
      .set({
        name: parsed.name,
        identifier: parsed.identifier,
        email: parsed.email ?? null,
        metadata: parsed.metadata,
      })
      .where(eq(callers.id, id));
    const [row] = await db.select().from(callers).where(eq(callers.id, id)).limit(1);
    return c.json({ data: row });
  });

  v1.delete("/callers/:id", async (c) => {
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const del = await db.delete(callers).where(eq(callers.id, idParse.data)).returning({ id: callers.id });
    if (!del.length) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  const logs = new Hono<{ Variables: { projectId: string; environment: string } }>();

  logs.use("*", async (c, next) => {
    const apiKey = c.req.header("X-API-Key");
    const headerEnv = c.req.header("X-Environment") ?? "dev";
    if (!apiKey) return c.json({ error: "missing_api_key" }, 401);
    const envParsed = environmentSchema.safeParse(headerEnv);
    if (!envParsed.success) return c.json({ error: "invalid_environment" }, 400);
    const [proj] = await db.select().from(projects).where(eq(projects.apiKey, apiKey)).limit(1);
    if (!proj?.isActive || proj.environment !== envParsed.data) return c.json({ error: "unauthorized" }, 401);
    c.set("projectId", proj.id);
    c.set("environment", proj.environment);
    await next();
  });

  logs.post("/", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const parsed = await parseJson(c, logIngestBodySchema);
    if (parsed instanceof Response) return parsed;

    const {
      requestHeaders,
      responseHeaders,
      requestBody,
      responseBody,
      callerId: rawCaller,
      ipAddress,
      userAgent,
      ...logFields
    } = parsed;

    const callerId = await assertCaller(projectId, rawCaller);
    if (rawCaller && !callerId) return c.json({ error: "invalid_caller_id" }, 400);

    const logId = newId();
    const ts = now();
    await db.insert(apiLogs).values({
      id: logId,
      projectId,
      environment,
      ...logFields,
      ipAddress: ipAddress ?? clientIp(c),
      userAgent: userAgent ?? c.req.header("user-agent") ?? "",
      callerId,
      timestamp: ts,
    });
    await insertLogExtras(logId, { requestHeaders, responseHeaders, requestBody, responseBody });
    return c.json({ data: { id: logId, timestamp: ts } }, 201);
  });

  logs.post("/batch", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const payload = await parseJson(c, logBatchBodySchema);
    if (payload instanceof Response) return payload;

    const createCallers = !!payload.createCallers;
    const errors: string[] = [];
    let ok = 0;
    let fail = 0;

    for (const item of payload.logs) {
      try {
        const {
          callerIdentifier,
          callerName,
          requestHeaders,
          responseHeaders,
          requestBody,
          responseBody,
          callerId: rawCaller,
          ipAddress,
          userAgent,
          ...logFields
        } = item;

        let callerId: string | null = rawCaller;
        if (createCallers && callerIdentifier) {
          const [ex] = await db
            .select()
            .from(callers)
            .where(and(eq(callers.identifier, callerIdentifier), eq(callers.projectId, projectId)))
            .limit(1);
          if (ex) {
            callerId = ex.id;
          } else if (callerName) {
            const row = {
              id: newId(),
              projectId,
              name: callerName,
              identifier: callerIdentifier,
              email: null as string | null,
              metadata: {} as Record<string, unknown>,
              createdAt: now(),
            };
            try {
              await db.insert(callers).values(row);
              callerId = row.id;
            } catch {
              callerId = null;
            }
          } else {
            callerId = null;
          }
        } else if (callerId) {
          const v = await assertCaller(projectId, callerId);
          if (!v) {
            fail++;
            errors.push("invalid_caller_id");
            continue;
          }
          callerId = v;
        }

        const logId = newId();
        const ts = now();
        await db.insert(apiLogs).values({
          id: logId,
          projectId,
          environment,
          ...logFields,
          ipAddress: ipAddress ?? clientIp(c),
          userAgent: userAgent ?? c.req.header("user-agent") ?? "",
          callerId,
          timestamp: ts,
        });
        await insertLogExtras(logId, { requestHeaders, responseHeaders, requestBody, responseBody });
        ok++;
      } catch (e) {
        fail++;
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const data = { successCount: ok, failedCount: fail, total: payload.logs.length, ...(errors.length ? { errors } : {}) };
    if (fail > 0) {
      if (ok === 0) return c.json({ data }, 500);
      return c.json({ data }, 206);
    }
    return c.json({ data }, 201);
  });

  logs.get("/", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const q = parseQuery(c, buildLogsListQuerySchema(tz));
    if (q instanceof Response) return q;

    // Strip response-only / UI echo fields; always scope to the authenticated environment.
    const {
      limit,
      offset,
      withCount,
      sort,
      date: _date,
      dateFrom: _dateFrom,
      dateTo: _dateTo,
      environment: _environment,
      ...filterRest
    } = q;
    const filter: LogFilter = { projectId, environment, ...filterRest };
    const sortOpts: LogListSort = sort;

    const { rows, total } = await queryLogsPage(filter, {
      limit,
      offset,
      withCount,
      sort: sortOpts,
    });

    return c.json({ data: rows, total, limit, offset });
  });

  /** Lightweight total for the same filters as GET / — used by the UI in parallel with the page. */
  logs.get("/count", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const q = parseQuery(c, buildLogsListQuerySchema(tz));
    if (q instanceof Response) return q;

    const {
      limit: _limit,
      offset: _offset,
      withCount: _withCount,
      sort: _sort,
      date: _date,
      dateFrom: _dateFrom,
      dateTo: _dateTo,
      environment: _environment,
      ...filterRest
    } = q;
    const filter: LogFilter = { projectId, environment, ...filterRest };
    const total = await countLogs(filter);
    return c.json({ data: { total } });
  });

  logs.get("/stats", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const [totalLogs, statusCodeDistribution, averageResponseTimeMs] = await Promise.all([
      countLogsSinceStartOfDay(projectId, environment, tz),
      fetchStatusCodeDistribution(projectId, environment, tz),
      averageResponseTime(projectId, environment, tz),
    ]);
    return c.json({
      data: {
        totalLogs,
        statusCodeDistribution,
        averageResponseTimeMs,
        environment,
        projectId,
      },
    });
  });

  logs.get("/paths", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const paths = await distinctPaths(projectId, environment, tz);
    return c.json({ data: paths });
  });

  /** Slow-endpoint summary: totals, latency buckets, per-path + pattern breakdown. */
  logs.get("/slow-summary", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const q = parseQuery(c, buildLogsListQuerySchema(tz));
    if (q instanceof Response) return q;

    const {
      limit,
      offset: _offset,
      withCount: _withCount,
      sort: _sort,
      date: _date,
      dateFrom: _dateFrom,
      dateTo: _dateTo,
      environment: _environment,
      minResponseTimeMs,
      excludePathContains: _excludePathContains,
      excludeExactPaths: _excludeExactPaths,
      excludePaths: _excludePaths,
      excludePathPrefixes: _excludePathPrefixes,
      ...filterRest
    } = q;
    // Hide/skip filters are applied in the UI; summary returns the full endpoint set.
    const filter: LogFilter = { projectId, environment, ...filterRest };
    const data = await querySlowSummary(filter, {
      thresholdMs: minResponseTimeMs ?? 500,
      limit: Math.min(Math.max(limit || 2000, 1), 5000),
    });
    return c.json({ data });
  });

  /** Per-caller traffic summary (requests, slow, errors, latency). */
  logs.get("/caller-summary", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const tz = resolveRequestTimezone(c.req.header("X-Timezone"));
    const q = parseQuery(c, buildLogsListQuerySchema(tz));
    if (q instanceof Response) return q;

    const {
      limit,
      offset: _offset,
      withCount: _withCount,
      sort: _sort,
      date: _date,
      dateFrom: _dateFrom,
      dateTo: _dateTo,
      environment: _environment,
      minResponseTimeMs,
      hasCaller: _hasCaller,
      ...filterRest
    } = q;
    const filter: LogFilter = { projectId, environment, ...filterRest };
    const data = await queryCallerSummary(filter, {
      thresholdMs: minResponseTimeMs ?? 1000,
      limit: Math.min(Math.max(limit || 2000, 1), 5000),
    });
    return c.json({ data });
  });

  logs.get("/analytics", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    // Daily buckets are written in ANALYTICS_TIMEZONE — keep reads on the same calendar.
    const tz = analyticsTimezone();
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const analyticsQuery = z
      .object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        days: z.coerce.number().int().min(1).max(90).optional(),
      })
      .superRefine((data, ctx) => {
        for (const key of ["dateFrom", "dateTo", "from", "to"] as const) {
          const v = data[key];
          if (v && !DATE_RE.test(v)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must be YYYY-MM-DD`, path: [key] });
          }
        }
      })
      .transform((q) => {
        const today = moment().tz(tz).format("YYYY-MM-DD");
        const span = q.days ?? 14;
        const defaultFrom = moment().tz(tz).subtract(span - 1, "days").format("YYYY-MM-DD");
        const fromRaw = q.dateFrom ?? q.from ?? defaultFrom;
        const toRaw = q.dateTo ?? q.to ?? today;
        return {
          dateFrom: DATE_RE.test(fromRaw) ? fromRaw : defaultFrom,
          dateTo: DATE_RE.test(toRaw) ? toRaw : today,
        };
      });

    const q = parseQuery(c, analyticsQuery);
    if (q instanceof Response) return q;

    try {
      const data = await queryAnalyticsRange({
        projectId,
        environment,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        timeZone: tz,
      });
      return c.json({ data });
    } catch (e) {
      console.error("[analytics]", e);
      return c.json(
        { error: "analytics_failed", message: e instanceof Error ? e.message : String(e) },
        500,
      );
    }
  });

  logs.get("/:id/details", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const idParse = uuidParam.safeParse(c.req.param("id"));
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const id = idParse.data;
    const [row] = await db
      .select()
      .from(apiLogs)
      .where(and(eq(apiLogs.id, id), eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment)))
      .limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);

    let caller = null;
    if (row.callerId) {
      const [cRow] = await db.select().from(callers).where(eq(callers.id, row.callerId)).limit(1);
      caller = cRow ?? null;
    }

    const [h] = await db.select().from(apiLogHeaders).where(eq(apiLogHeaders.logId, id)).limit(1);
    const [b] = await db.select().from(apiLogBodies).where(eq(apiLogBodies.logId, id)).limit(1);
    return c.json({
      data: {
        log: caller ? { ...row, caller } : row,
        headers: h ?? null,
        body: b ?? null,
      },
    });
  });

  logs.get("/:id", async (c) => {
    const projectId = c.get("projectId");
    const environment = c.get("environment");
    const id = c.req.param("id");
    if (["batch", "stats", "paths", "analytics", "count", "slow-summary", "caller-summary"].includes(id)) return c.notFound();
    const idParse = uuidParam.safeParse(id);
    if (!idParse.success) return c.json({ error: "validation_error", issues: idParse.error.flatten() }, 400);
    const [row] = await db
      .select()
      .from(apiLogs)
      .where(and(eq(apiLogs.id, idParse.data), eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment)))
      .limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ data: row });
  });

  v1.route("/logs", logs);
  app.route("/api/v1", v1);

  return app;
}
