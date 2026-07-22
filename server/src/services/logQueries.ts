import { and, asc, avg, count, desc, eq, gte, inArray, isNotNull, lt, lte, not, or, sql, type SQL } from "drizzle-orm";
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

function notIlikeContains(column: AnyPgColumn, raw: string): SQL {
  const pat = `%${escapeIlike(raw)}%`;
  return sql`${column} NOT ILIKE ${pat} ESCAPE '\\'`;
}

/** Strip optional surrounding `*` — matching is always contains (`*pattern*`). */
function normalizeSkipPattern(raw: string): string {
  return raw.trim().replace(/^\*+/, "").replace(/\*+$/, "").trim();
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
  /** Exact path match (endpoint drill-down). */
  exactPath?: string;
  /**
   * Substring patterns to omit (`*pattern*` / contains).
   * Aliases: excludePathPrefixes, excludePaths (same behavior).
   */
  excludePathContains?: string[];
  /** @deprecated alias of excludePathContains */
  excludePathPrefixes?: string[];
  /** @deprecated alias of excludePathContains */
  excludePaths?: string[];
  /** Exact paths to omit (hide specific endpoints). */
  excludeExactPaths?: string[];
  search?: string;
  searchFields?: Array<"path" | "ip" | "userAgent" | "error" | "host" | "service" | "requestId" | "traceId">;
  traceId?: string;
  service?: string;
  callerId?: string;
  callerIds?: string[];
  callerSearch?: string;
  /** Only rows that have a linked caller. */
  hasCaller?: boolean;
  fromDate?: Date;
  toDate?: Date;
  /** Inclusive lower bound on response_time_ms */
  minResponseTimeMs?: number;
  /** Inclusive upper bound on response_time_ms */
  maxResponseTimeMs?: number;
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
  if (filter.exactPath) parts.push(eq(apiLogs.path, filter.exactPath));
  const excludeContains = [
    ...new Set(
      [
        ...(filter.excludePathContains ?? []),
        ...(filter.excludePathPrefixes ?? []),
        ...(filter.excludePaths ?? []),
      ]
        .map(normalizeSkipPattern)
        .filter(Boolean),
    ),
  ];
  for (const frag of excludeContains) {
    parts.push(notIlikeContains(apiLogs.path, frag));
  }
  if (filter.excludeExactPaths?.length) {
    parts.push(not(inArray(apiLogs.path, filter.excludeExactPaths)));
  }
  if (filter.minResponseTimeMs != null) {
    parts.push(gte(apiLogs.responseTimeMs, filter.minResponseTimeMs));
  }
  if (filter.maxResponseTimeMs != null) {
    parts.push(lte(apiLogs.responseTimeMs, filter.maxResponseTimeMs));
  }
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
  if (filter.hasCaller) {
    parts.push(isNotNull(apiLogs.callerId));
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
    filter.exactPath ||
    filter.excludePaths?.length ||
    filter.excludePathPrefixes?.length ||
    filter.excludePathContains?.length ||
    filter.excludeExactPaths?.length ||
    filter.search ||
    filter.traceId ||
    filter.service ||
    filter.callerId ||
    filter.callerIds?.length ||
    filter.callerSearch ||
    filter.hasCaller ||
    filter.minResponseTimeMs != null ||
    filter.maxResponseTimeMs != null
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

export type SlowBuckets = {
  /** 500ms – 999ms */
  b500: number;
  /** 1s – 1.999s */
  b1000: number;
  /** 2s – 4.999s */
  b2000: number;
  /** ≥ 5s */
  b5000: number;
};

export type SlowEndpointRow = {
  path: string;
  /** First path segment pattern, e.g. `/internal/*` */
  pattern: string;
  total: number;
  /** Requests at or above `thresholdMs` */
  slow: number;
  slowPct: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  buckets: SlowBuckets;
};

export type SlowPatternRow = {
  pattern: string;
  total: number;
  slow: number;
  slowPct: number;
  endpoints: number;
  buckets: SlowBuckets;
};

export type SlowSummaryResult = {
  thresholdMs: number;
  totalRequests: number;
  slowRequests: number;
  totalEndpoints: number;
  slowEndpoints: number;
  buckets: SlowBuckets;
  endpoints: SlowEndpointRow[];
  patterns: SlowPatternRow[];
};

function emptyBuckets(): SlowBuckets {
  return { b500: 0, b1000: 0, b2000: 0, b5000: 0 };
}

function pathPattern(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/*";
  return `/${parts[0]}/*`;
}

/**
 * Endpoint-level slow-request breakdown for a date range.
 * Totals include fast requests; bucket/slow counts use fixed latency bands + `thresholdMs`.
 */
export async function querySlowSummary(
  filter: LogFilter,
  opts?: { thresholdMs?: number; limit?: number },
): Promise<SlowSummaryResult> {
  const thresholdMs = Math.max(0, opts?.thresholdMs ?? filter.minResponseTimeMs ?? 500);
  // Return all slow endpoints — UI filters/hides client-side.
  const limit = Math.min(Math.max(opts?.limit ?? 2000, 1), 5000);

  // Totals must include fast requests — strip latency bounds from the base filter.
  const baseFilter: LogFilter = {
    ...filter,
    minResponseTimeMs: undefined,
    maxResponseTimeMs: undefined,
  };
  const where = logWhereParts(baseFilter);
  const needsCallerJoin = Boolean(baseFilter.callerSearch);

  const bucketSelect = {
    b500: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= 500 AND ${apiLogs.responseTimeMs} < 1000)::int`,
    b1000: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= 1000 AND ${apiLogs.responseTimeMs} < 2000)::int`,
    b2000: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= 2000 AND ${apiLogs.responseTimeMs} < 5000)::int`,
    b5000: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= 5000)::int`,
  };

  const summaryBase = db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      slowRequests: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs})::int`,
      totalEndpoints: sql<number>`count(DISTINCT ${apiLogs.path})::int`,
      slowEndpoints: sql<number>`count(DISTINCT ${apiLogs.path}) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs})::int`,
      ...bucketSelect,
    })
    .from(apiLogs)
    .$dynamic();
  const summaryQ = needsCallerJoin
    ? summaryBase.leftJoin(callers, eq(apiLogs.callerId, callers.id)).where(where)
    : summaryBase.where(where);

  const endpointsBase = db
    .select({
      path: apiLogs.path,
      total: sql<number>`count(*)::int`,
      slow: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs})::int`,
      avgMs: sql<number>`coalesce(avg(${apiLogs.responseTimeMs}), 0)::float8`,
      p95Ms: sql<number>`coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${apiLogs.responseTimeMs}), 0)::float8`,
      maxMs: sql<number>`coalesce(max(${apiLogs.responseTimeMs}), 0)::float8`,
      ...bucketSelect,
    })
    .from(apiLogs)
    .$dynamic();
  const endpointsJoined = needsCallerJoin
    ? endpointsBase.leftJoin(callers, eq(apiLogs.callerId, callers.id))
    : endpointsBase;
  const endpointsQ = endpointsJoined
    .where(where)
    .groupBy(apiLogs.path)
    .having(sql`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs}) > 0`)
    .orderBy(sql`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs}) desc`)
    .limit(limit);

  const [[summary], endpoints] = await Promise.all([summaryQ, endpointsQ]);

  const mapped: SlowEndpointRow[] = endpoints.map((r) => {
    const total = Number(r.total ?? 0);
    const slow = Number(r.slow ?? 0);
    return {
      path: r.path,
      pattern: pathPattern(r.path),
      total,
      slow,
      slowPct: total > 0 ? Math.round((slow / total) * 1000) / 10 : 0,
      avgMs: Math.round(Number(r.avgMs ?? 0)),
      p95Ms: Math.round(Number(r.p95Ms ?? 0)),
      maxMs: Math.round(Number(r.maxMs ?? 0)),
      buckets: {
        b500: Number(r.b500 ?? 0),
        b1000: Number(r.b1000 ?? 0),
        b2000: Number(r.b2000 ?? 0),
        b5000: Number(r.b5000 ?? 0),
      },
    };
  });

  const patternMap = new Map<
    string,
    { total: number; slow: number; endpoints: number; buckets: SlowBuckets }
  >();
  for (const e of mapped) {
    const cur = patternMap.get(e.pattern) ?? { total: 0, slow: 0, endpoints: 0, buckets: emptyBuckets() };
    cur.total += e.total;
    cur.slow += e.slow;
    cur.endpoints += 1;
    cur.buckets.b500 += e.buckets.b500;
    cur.buckets.b1000 += e.buckets.b1000;
    cur.buckets.b2000 += e.buckets.b2000;
    cur.buckets.b5000 += e.buckets.b5000;
    patternMap.set(e.pattern, cur);
  }
  const patterns: SlowPatternRow[] = [...patternMap.entries()]
    .map(([pattern, v]) => ({
      pattern,
      total: v.total,
      slow: v.slow,
      slowPct: v.total > 0 ? Math.round((v.slow / v.total) * 1000) / 10 : 0,
      endpoints: v.endpoints,
      buckets: v.buckets,
    }))
    .sort((a, b) => b.slow - a.slow);

  return {
    thresholdMs,
    totalRequests: Number(summary?.totalRequests ?? 0),
    slowRequests: Number(summary?.slowRequests ?? 0),
    totalEndpoints: Number(summary?.totalEndpoints ?? 0),
    slowEndpoints: Number(summary?.slowEndpoints ?? 0),
    buckets: {
      b500: Number(summary?.b500 ?? 0),
      b1000: Number(summary?.b1000 ?? 0),
      b2000: Number(summary?.b2000 ?? 0),
      b5000: Number(summary?.b5000 ?? 0),
    },
    endpoints: mapped,
    patterns,
  };
}

export type CallerSummaryRow = {
  callerId: string;
  name: string;
  identifier: string;
  total: number;
  slow: number;
  slowPct: number;
  error4xx: number;
  error5xx: number;
  uniquePaths: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
};

export type CallerSummaryResult = {
  thresholdMs: number;
  totalRequests: number;
  slowRequests: number;
  error4xx: number;
  error5xx: number;
  callerCount: number;
  avgMs: number;
  p95Ms: number;
  callers: CallerSummaryRow[];
};

/**
 * Per-caller traffic summary for a date range (attributed logs only).
 */
export async function queryCallerSummary(
  filter: LogFilter,
  opts?: { thresholdMs?: number; limit?: number },
): Promise<CallerSummaryResult> {
  const thresholdMs = Math.max(0, opts?.thresholdMs ?? filter.minResponseTimeMs ?? 1000);
  const limit = Math.min(Math.max(opts?.limit ?? 2000, 1), 5000);

  const baseFilter: LogFilter = {
    ...filter,
    minResponseTimeMs: undefined,
    maxResponseTimeMs: undefined,
    hasCaller: true,
  };
  const where = logWhereParts(baseFilter);

  const [[summary], rows] = await Promise.all([
    db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        slowRequests: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs})::int`,
        error4xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 400 AND ${apiLogs.statusCode} < 500)::int`,
        error5xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 500)::int`,
        callerCount: sql<number>`count(DISTINCT ${apiLogs.callerId})::int`,
        avgMs: sql<number>`coalesce(avg(${apiLogs.responseTimeMs}), 0)::float8`,
        p95Ms: sql<number>`coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${apiLogs.responseTimeMs}), 0)::float8`,
      })
      .from(apiLogs)
      .leftJoin(callers, eq(apiLogs.callerId, callers.id))
      .where(where),
    db
      .select({
        callerId: apiLogs.callerId,
        name: callers.name,
        identifier: callers.identifier,
        total: sql<number>`count(*)::int`,
        slow: sql<number>`count(*) FILTER (WHERE ${apiLogs.responseTimeMs} >= ${thresholdMs})::int`,
        error4xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 400 AND ${apiLogs.statusCode} < 500)::int`,
        error5xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 500)::int`,
        uniquePaths: sql<number>`count(DISTINCT ${apiLogs.path})::int`,
        avgMs: sql<number>`coalesce(avg(${apiLogs.responseTimeMs}), 0)::float8`,
        p95Ms: sql<number>`coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${apiLogs.responseTimeMs}), 0)::float8`,
        maxMs: sql<number>`coalesce(max(${apiLogs.responseTimeMs}), 0)::float8`,
      })
      .from(apiLogs)
      .leftJoin(callers, eq(apiLogs.callerId, callers.id))
      .where(where)
      .groupBy(apiLogs.callerId, callers.name, callers.identifier)
      .orderBy(sql`count(*) desc`)
      .limit(limit),
  ]);

  const callersMapped: CallerSummaryRow[] = rows
    .filter((r): r is typeof r & { callerId: string } => Boolean(r.callerId))
    .map((r) => {
      const total = Number(r.total ?? 0);
      const slow = Number(r.slow ?? 0);
      return {
        callerId: r.callerId,
        name: r.name ?? "Unknown",
        identifier: r.identifier ?? "",
        total,
        slow,
        slowPct: total > 0 ? Math.round((slow / total) * 1000) / 10 : 0,
        error4xx: Number(r.error4xx ?? 0),
        error5xx: Number(r.error5xx ?? 0),
        uniquePaths: Number(r.uniquePaths ?? 0),
        avgMs: Math.round(Number(r.avgMs ?? 0)),
        p95Ms: Math.round(Number(r.p95Ms ?? 0)),
        maxMs: Math.round(Number(r.maxMs ?? 0)),
      };
    });

  return {
    thresholdMs,
    totalRequests: Number(summary?.totalRequests ?? 0),
    slowRequests: Number(summary?.slowRequests ?? 0),
    error4xx: Number(summary?.error4xx ?? 0),
    error5xx: Number(summary?.error5xx ?? 0),
    callerCount: Number(summary?.callerCount ?? 0),
    avgMs: Math.round(Number(summary?.avgMs ?? 0)),
    p95Ms: Math.round(Number(summary?.p95Ms ?? 0)),
    callers: callersMapped,
  };
}
