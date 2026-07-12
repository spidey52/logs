import { and, asc, avg, count, desc, eq, getTableColumns, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { moment } from "../lib/time";
import { db } from "../db";
import { apiLogs, callers } from "../db/schema";

export type LogSortField = "timestamp" | "method" | "status_code" | "response_time_ms" | "path" | "caller";

export type LogListSort = {
  field: LogSortField;
  order: "asc" | "desc";
};

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function ilikeContains(column: AnyPgColumn, raw: string): SQL {
  const pat = `%${escapeIlike(raw)}%`;
  return sql`${column} ILIKE ${pat} ESCAPE '\\'`;
}

export type LogFilter = {
  projectId: string;
  environment?: string;
  method?: string;
  methods?: string[];
  statusCode?: number;
  statusCodeMin?: number;
  statusCodeMax?: number;
  statusCodes?: number[];
  path?: string;
  search?: string;
  searchFields?: Array<"path" | "ip" | "userAgent" | "error" | "host" | "service" | "requestId" | "traceId">;
  traceId?: string;
  service?: string;
  callerId?: string;
  callerIds?: string[];
  callerSearch?: string;
  fromDate?: Date;
  toDate?: Date;
};

export type LogListRow = typeof apiLogs.$inferSelect & {
  caller: { id: string; name: string; identifier: string } | null;
};

function logWhereParts(filter: LogFilter) {
  const parts = [eq(apiLogs.projectId, filter.projectId)];
  if (filter.environment) parts.push(eq(apiLogs.environment, filter.environment));
  if (filter.methods?.length) {
    parts.push(inArray(apiLogs.method, filter.methods));
  } else if (filter.method) {
    parts.push(eq(apiLogs.method, filter.method));
  }
  if (filter.statusCodes?.length) {
    parts.push(inArray(apiLogs.statusCode, filter.statusCodes));
  } else if (filter.statusCode != null) {
    parts.push(eq(apiLogs.statusCode, filter.statusCode));
  } else {
    if (filter.statusCodeMin != null) parts.push(gte(apiLogs.statusCode, filter.statusCodeMin));
    if (filter.statusCodeMax != null) parts.push(lte(apiLogs.statusCode, filter.statusCodeMax));
  }
  if (filter.path) parts.push(ilikeContains(apiLogs.path, filter.path));
  if (filter.search) {
    const fields = filter.searchFields?.length
      ? filter.searchFields
      : (["path", "ip", "userAgent"] as const);
    const searchParts: SQL[] = [];
    for (const f of fields) {
      switch (f) {
        case "path":
          searchParts.push(ilikeContains(apiLogs.path, filter.search));
          break;
        case "ip":
          searchParts.push(ilikeContains(apiLogs.ipAddress, filter.search));
          break;
        case "userAgent":
          searchParts.push(ilikeContains(apiLogs.userAgent, filter.search));
          break;
        case "error":
          searchParts.push(ilikeContains(apiLogs.errorMessage, filter.search));
          break;
        case "host":
          searchParts.push(ilikeContains(apiLogs.host, filter.search));
          break;
        case "service":
          searchParts.push(ilikeContains(apiLogs.service, filter.search));
          break;
        case "requestId":
          searchParts.push(ilikeContains(apiLogs.requestId, filter.search));
          break;
        case "traceId":
          searchParts.push(ilikeContains(apiLogs.traceId, filter.search));
          break;
      }
    }
    if (searchParts.length === 1) parts.push(searchParts[0]!);
    else if (searchParts.length > 1) parts.push(or(...searchParts)!);
  }
  if (filter.traceId) parts.push(eq(apiLogs.traceId, filter.traceId));
  if (filter.service) parts.push(eq(apiLogs.service, filter.service));
  if (filter.callerIds?.length) {
    parts.push(inArray(apiLogs.callerId, filter.callerIds));
  } else if (filter.callerId) {
    parts.push(eq(apiLogs.callerId, filter.callerId));
  }
  if (filter.callerSearch) {
    parts.push(
      or(
        ilikeContains(callers.name, filter.callerSearch),
        ilikeContains(callers.identifier, filter.callerSearch),
      )!,
    );
  }
  if (filter.fromDate) parts.push(gte(apiLogs.timestamp, filter.fromDate));
  if (filter.toDate) parts.push(lte(apiLogs.timestamp, filter.toDate));
  return and(...parts);
}

function orderByClause(sort: LogSortField, order: "asc" | "desc") {
  const dir = order === "asc" ? asc : desc;
  switch (sort) {
    case "timestamp":
      return [dir(apiLogs.timestamp), dir(apiLogs.id)];
    case "method":
      return [dir(apiLogs.method), dir(apiLogs.id)];
    case "status_code":
      return [dir(apiLogs.statusCode), dir(apiLogs.id)];
    case "response_time_ms":
      return [dir(apiLogs.responseTimeMs), dir(apiLogs.id)];
    case "path":
      return [dir(apiLogs.path), dir(apiLogs.id)];
    case "caller":
      return order === "asc"
        ? [sql`COALESCE(${callers.name}, '') asc`, asc(apiLogs.id)]
        : [sql`COALESCE(${callers.name}, '') desc`, desc(apiLogs.id)];
    default:
      return [dir(apiLogs.timestamp), dir(apiLogs.id)];
  }
}

export async function queryLogsPage(
  filter: LogFilter,
  opts: { limit: number; offset: number; withCount: boolean; sort: LogListSort },
): Promise<{ rows: LogListRow[]; total: number | null; limit: number; offset: number }> {
  const where = logWhereParts(filter);
  const ob = orderByClause(opts.sort.field, opts.sort.order);

  const selectShape = {
    ...getTableColumns(apiLogs),
    caller: {
      id: callers.id,
      name: callers.name,
      identifier: callers.identifier,
    },
  };

  if (opts.withCount) {
    const rows = await db
      .select({
        ...selectShape,
        _total: sql<string>`(count(*) over ())::text`,
      })
      .from(apiLogs)
      .leftJoin(callers, eq(apiLogs.callerId, callers.id))
      .where(where)
      .orderBy(...ob)
      .limit(opts.limit)
      .offset(opts.offset);

    if (!rows.length) {
      return { rows: [], total: 0, limit: opts.limit, offset: opts.offset };
    }

    const total = Number(rows[0]!._total);
    const clean: LogListRow[] = rows.map(({ _total: _, ...r }) => ({
      ...r,
      caller: r.caller?.id ? r.caller : null,
    }));
    return { rows: clean, total, limit: opts.limit, offset: opts.offset };
  }

  const rows = await db
    .select(selectShape)
    .from(apiLogs)
    .leftJoin(callers, eq(apiLogs.callerId, callers.id))
    .where(where)
    .orderBy(...ob)
    .limit(opts.limit)
    .offset(opts.offset);

  const clean: LogListRow[] = rows.map((r) => ({
    ...r,
    caller: r.caller?.id ? r.caller : null,
  }));
  return { rows: clean, total: null, limit: opts.limit, offset: opts.offset };
}

function startOfToday(timeZone: string): Date {
  return moment().tz(timeZone).startOf("day").toDate();
}

export async function countLogsSinceStartOfDay(projectId: string, environment: string, timeZone: string) {
  const start = startOfToday(timeZone);
  const [row] = await db
    .select({ n: count() })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)));
  return Number(row?.n ?? 0);
}

export async function statusCodeDistribution(projectId: string, environment: string, timeZone: string) {
  const start = startOfToday(timeZone);
  const rows = await db
    .select({
      code: apiLogs.statusCode,
      cnt: count(),
    })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)))
    .groupBy(apiLogs.statusCode);

  const dist: Record<number, number> = {};
  for (const r of rows) {
    dist[Number(r.code)] = Number(r.cnt);
  }
  return dist;
}

export async function averageResponseTime(projectId: string, environment: string, timeZone: string) {
  const start = startOfToday(timeZone);
  const [row] = await db
    .select({ avgMs: avg(apiLogs.responseTimeMs) })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)));
  const v = row?.avgMs;
  if (v == null || v === "") return 0;
  return Number(v);
}

export async function distinctPaths(projectId: string, environment: string, timeZone: string) {
  const start = startOfToday(timeZone);
  const rows = await db
    .selectDistinct({ path: apiLogs.path })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)))
    .orderBy(asc(apiLogs.path));
  return rows.map((r) => r.path);
}
