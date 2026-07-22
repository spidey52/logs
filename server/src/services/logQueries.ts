import { and, asc, avg, count, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { moment } from "../lib/time";
import { db } from "../db";
import { apiLogDailyAnalytics, apiLogs, callers } from "../db/schema";
import { analyticsTimezone } from "../lib/env";

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

export type LogListRow = {
  id: string;
  projectId: string;
  environment: string;
  method: string;
  path: string;
  params: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  statusCode: number;
  responseTimeMs: number;
  contentLength: number;
  ipAddress: string;
  userAgent: string;
  errorMessage: string;
  callerId: string | null;
  traceId: string | null;
  spanId: string | null;
  service: string | null;
  host: string | null;
  requestId: string | null;
  timestamp: Date;
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
  // `toDate` is exclusive (start of the day after the selected end date).
  if (filter.toDate) parts.push(lt(apiLogs.timestamp, filter.toDate));
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

/** Filters that only need project/env/time — safe to answer from daily analytics. */
function isSimpleDateFilter(filter: LogFilter): boolean {
  return !(
    filter.method ||
    filter.methods?.length ||
    filter.statusCode != null ||
    filter.statusCodeMin != null ||
    filter.statusCodeMax != null ||
    filter.statusCodes?.length ||
    filter.path ||
    filter.search ||
    filter.traceId ||
    filter.service ||
    filter.callerId ||
    filter.callerIds?.length ||
    filter.callerSearch
  );
}

/**
 * Fast total for date-only filters: sum rollups for completed days + live count for
 * any day still missing from analytics (typically today).
 */
async function countViaAnalytics(filter: LogFilter): Promise<number | null> {
  if (!filter.environment || !filter.fromDate || !filter.toDate) return null;
  if (!isSimpleDateFilter(filter)) return null;

  const tz = analyticsTimezone();
  const fromDay = moment(filter.fromDate).tz(tz);
  const toExclusive = moment(filter.toDate).tz(tz);
  const dateFrom = fromDay.format("YYYY-MM-DD");
  const dateToInclusive = toExclusive.clone().subtract(1, "day").format("YYYY-MM-DD");
  if (dateFrom > dateToInclusive) return 0;

  const storedRows = await db
    .select({
      d: apiLogDailyAnalytics.bucketDate,
      n: apiLogDailyAnalytics.totalRequests,
    })
    .from(apiLogDailyAnalytics)
    .where(
      and(
        eq(apiLogDailyAnalytics.projectId, filter.projectId),
        eq(apiLogDailyAnalytics.environment, filter.environment),
        gte(apiLogDailyAnalytics.bucketDate, dateFrom),
        lt(apiLogDailyAnalytics.bucketDate, toExclusive.format("YYYY-MM-DD")),
      ),
    );

  let total = 0;
  const have = new Set<string>();
  for (const r of storedRows) {
    const raw = r.d as unknown;
    const key =
      typeof raw === "string"
        ? raw.slice(0, 10)
        : raw instanceof Date
          ? moment.utc(raw).format("YYYY-MM-DD")
          : String(raw).slice(0, 10);
    have.add(key);
    total += Number(r.n ?? 0);
  }

  const cursor = moment.tz(dateFrom, "YYYY-MM-DD", true, tz).startOf("day");
  const end = moment.tz(dateToInclusive, "YYYY-MM-DD", true, tz).startOf("day");
  const missing: { start: Date; end: Date }[] = [];
  while (cursor.isSameOrBefore(end, "day")) {
    const key = cursor.format("YYYY-MM-DD");
    if (!have.has(key)) {
      missing.push({
        start: cursor.toDate(),
        end: cursor.clone().add(1, "day").toDate(),
      });
    }
    cursor.add(1, "day");
  }

  if (missing.length) {
    // Collapse contiguous calendar gaps into fewer OR branches.
    const collapsed: { start: Date; end: Date }[] = [];
    for (const m of missing) {
      const last = collapsed[collapsed.length - 1];
      if (last && last.end.getTime() === m.start.getTime()) {
        last.end = m.end;
      } else {
        collapsed.push({ start: m.start, end: m.end });
      }
    }
    const rangeOr = collapsed.map((m) => and(gte(apiLogs.timestamp, m.start), lt(apiLogs.timestamp, m.end))!);
    const [row] = await db
      .select({ n: count() })
      .from(apiLogs)
      .where(
        and(
          eq(apiLogs.projectId, filter.projectId),
          eq(apiLogs.environment, filter.environment!),
          rangeOr.length === 1 ? rangeOr[0]! : or(...rangeOr)!,
        ),
      );
    total += Number(row?.n ?? 0);
  }

  return total;
}

async function countExact(filter: LogFilter, needsCallerJoin: boolean): Promise<number> {
  const where = logWhereParts(filter);
  if (needsCallerJoin) {
    const [row] = await db
      .select({ n: count() })
      .from(apiLogs)
      .leftJoin(callers, eq(apiLogs.callerId, callers.id))
      .where(where);
    return Number(row?.n ?? 0);
  }
  const [row] = await db.select({ n: count() }).from(apiLogs).where(where);
  return Number(row?.n ?? 0);
}

export async function countLogs(filter: LogFilter): Promise<number> {
  const needsCallerJoin = Boolean(filter.callerSearch);
  // Single-day (and other short) windows: exact index count is cheaper and avoids
  // the analytics path accidentally walking a wide calendar gap list.
  if (filter.fromDate && filter.toDate) {
    const spanMs = filter.toDate.getTime() - filter.fromDate.getTime();
    if (spanMs > 0 && spanMs <= 36 * 60 * 60 * 1000) {
      return countExact(filter, needsCallerJoin);
    }
  }
  const fast = await countViaAnalytics(filter);
  if (fast != null) return fast;
  return countExact(filter, needsCallerJoin);
}

/** List columns only — skip bulky jsonb params that the grid never shows. */
const listSelectShape = {
  id: apiLogs.id,
  projectId: apiLogs.projectId,
  environment: apiLogs.environment,
  method: apiLogs.method,
  path: apiLogs.path,
  params: sql<Record<string, string> | null>`null`.as("params"),
  queryParams: sql<Record<string, string> | null>`null`.as("query_params"),
  statusCode: apiLogs.statusCode,
  responseTimeMs: apiLogs.responseTimeMs,
  contentLength: apiLogs.contentLength,
  ipAddress: apiLogs.ipAddress,
  userAgent: apiLogs.userAgent,
  errorMessage: apiLogs.errorMessage,
  callerId: apiLogs.callerId,
  traceId: apiLogs.traceId,
  spanId: apiLogs.spanId,
  service: apiLogs.service,
  host: apiLogs.host,
  requestId: apiLogs.requestId,
  timestamp: apiLogs.timestamp,
  caller: {
    id: callers.id,
    name: callers.name,
    identifier: callers.identifier,
  },
};

export async function queryLogsPage(
  filter: LogFilter,
  opts: { limit: number; offset: number; withCount: boolean; sort: LogListSort },
): Promise<{ rows: LogListRow[]; total: number | null; limit: number; offset: number }> {
  const where = logWhereParts(filter);
  const ob = orderByClause(opts.sort.field, opts.sort.order);
  const needsCallerJoin = Boolean(filter.callerSearch) || opts.sort.field === "caller";

  const rowsPromise = db
    .select(listSelectShape)
    .from(apiLogs)
    .leftJoin(callers, eq(apiLogs.callerId, callers.id))
    .where(where)
    .orderBy(...ob)
    .limit(opts.limit)
    .offset(opts.offset);

  if (!opts.withCount) {
    const rows = await rowsPromise;
    return {
      rows: rows.map((r) => ({ ...r, caller: r.caller?.id ? r.caller : null })),
      total: null,
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  // Count + page in parallel (one RTT saved on remote DBs). Prefer analytics rollups
  // when the filter is date/env only — avoids scanning hundreds of thousands of rows.
  const [total, rows] = await Promise.all([countLogs(filter), rowsPromise]);

  if (total === 0) {
    return { rows: [], total: 0, limit: opts.limit, offset: opts.offset };
  }

  return {
    rows: rows.map((r) => ({ ...r, caller: r.caller?.id ? r.caller : null })),
    total,
    limit: opts.limit,
    offset: opts.offset,
  };
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
