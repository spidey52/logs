import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  apiLogDailyAnalytics,
  apiLogs,
  callers,
  type MethodDistribution,
  type StatusDistribution,
  type TopCallerEntry,
  type TopPathEntry,
} from "../db/schema";
import { newId } from "../lib/ids";
import { moment, now } from "../lib/time";

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const TOP_N = 20;

export function analyticsTimezone(): string {
  return process.env.ANALYTICS_TIMEZONE?.trim() || "UTC";
}

export function logRetentionDays(): number {
  const n = Number(process.env.LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}

function pruneIntervalMs(): number {
  const n = Number(process.env.PRUNE_JOB_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(n) && n >= 60_000 ? Math.floor(n) : DEFAULT_INTERVAL_MS;
}

function dayBounds(bucketDate: string, tz: string): { start: Date; endExclusive: Date } {
  const start = moment.tz(bucketDate, "YYYY-MM-DD", true, tz).startOf("day");
  return {
    start: start.toDate(),
    endExclusive: start.clone().add(1, "day").toDate(),
  };
}

type DayKey = { projectId: string; environment: string; bucketDate: string };

async function listDaysNeedingAggregation(tz: string, today: string): Promise<DayKey[]> {
  const rows = await db.execute<{ project_id: string; environment: string; bucket_date: string }>(sql`
    SELECT DISTINCT
      l.project_id,
      l.environment,
      to_char((l.timestamp AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket_date
    FROM api_logs l
    WHERE to_char((l.timestamp AT TIME ZONE ${tz}), 'YYYY-MM-DD') < ${today}
      AND NOT EXISTS (
        SELECT 1
        FROM api_log_daily_analytics a
        WHERE a.project_id = l.project_id
          AND a.environment = l.environment
          AND a.bucket_date = (to_char((l.timestamp AT TIME ZONE ${tz}), 'YYYY-MM-DD'))::date
      )
    ORDER BY bucket_date ASC
    LIMIT 60
  `);
  return rows.map((r) => ({
    projectId: r.project_id,
    environment: r.environment,
    bucketDate: r.bucket_date,
  }));
}

async function aggregateDay(key: DayKey, tz: string): Promise<void> {
  const { start, endExclusive } = dayBounds(key.bucketDate, tz);
  const baseWhere = and(
    eq(apiLogs.projectId, key.projectId),
    eq(apiLogs.environment, key.environment),
    gte(apiLogs.timestamp, start),
    lt(apiLogs.timestamp, endExclusive),
  );

  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      success2xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 200 AND ${apiLogs.statusCode} < 300)::int`,
      clientError4xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 400 AND ${apiLogs.statusCode} < 500)::int`,
      serverError5xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 500)::int`,
      avgResponseTimeMs: sql<number>`coalesce(avg(${apiLogs.responseTimeMs}), 0)::float8`,
      p95ResponseTimeMs: sql<number>`coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${apiLogs.responseTimeMs}), 0)::float8`,
      uniquePaths: sql<number>`count(DISTINCT ${apiLogs.path})::int`,
      uniqueCallers: sql<number>`count(DISTINCT ${apiLogs.callerId})::int`,
    })
    .from(apiLogs)
    .where(baseWhere);

  if (!totals || Number(totals.totalRequests) === 0) return;

  const statusRows = await db
    .select({
      code: apiLogs.statusCode,
      cnt: sql<number>`count(*)::int`,
    })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.statusCode);

  const statusCodeDistribution: StatusDistribution = {};
  for (const r of statusRows) statusCodeDistribution[String(r.code)] = Number(r.cnt);

  const methodRows = await db
    .select({
      method: apiLogs.method,
      cnt: sql<number>`count(*)::int`,
    })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.method);

  const methodDistribution: MethodDistribution = {};
  for (const r of methodRows) methodDistribution[r.method] = Number(r.cnt);

  const pathRows = await db
    .select({
      path: apiLogs.path,
      cnt: sql<number>`count(*)::int`,
    })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.path)
    .orderBy(sql`count(*) DESC`)
    .limit(TOP_N);

  const topPaths: TopPathEntry[] = pathRows.map((r) => ({ path: r.path, count: Number(r.cnt) }));

  const callerRows = await db
    .select({
      callerId: apiLogs.callerId,
      name: callers.name,
      cnt: sql<number>`count(*)::int`,
    })
    .from(apiLogs)
    .leftJoin(callers, eq(apiLogs.callerId, callers.id))
    .where(and(baseWhere, sql`${apiLogs.callerId} IS NOT NULL`))
    .groupBy(apiLogs.callerId, callers.name)
    .orderBy(sql`count(*) DESC`)
    .limit(TOP_N);

  const topCallers: TopCallerEntry[] = callerRows.map((r) => ({
    callerId: r.callerId,
    name: r.name,
    count: Number(r.cnt),
  }));

  const t = now();
  const existing = await db
    .select({ id: apiLogDailyAnalytics.id })
    .from(apiLogDailyAnalytics)
    .where(
      and(
        eq(apiLogDailyAnalytics.projectId, key.projectId),
        eq(apiLogDailyAnalytics.environment, key.environment),
        eq(apiLogDailyAnalytics.bucketDate, key.bucketDate),
      ),
    )
    .limit(1);

  const values = {
    totalRequests: Number(totals.totalRequests),
    success2xx: Number(totals.success2xx),
    clientError4xx: Number(totals.clientError4xx),
    serverError5xx: Number(totals.serverError5xx),
    avgResponseTimeMs: Number(totals.avgResponseTimeMs),
    p95ResponseTimeMs: Number(totals.p95ResponseTimeMs),
    uniquePaths: Number(totals.uniquePaths),
    uniqueCallers: Number(totals.uniqueCallers),
    statusCodeDistribution,
    methodDistribution,
    topPaths,
    topCallers,
    updatedAt: t,
  };

  if (existing[0]) {
    await db.update(apiLogDailyAnalytics).set(values).where(eq(apiLogDailyAnalytics.id, existing[0].id));
  } else {
    await db.insert(apiLogDailyAnalytics).values({
      id: newId(),
      projectId: key.projectId,
      environment: key.environment,
      bucketDate: key.bucketDate,
      ...values,
      createdAt: t,
    });
  }
}

async function pruneOldLogs(retentionDays: number): Promise<number> {
  const cutoffIso = moment.utc().subtract(retentionDays, "days").toISOString();
  // Delete in batches to avoid long locks on large tables.
  let deleted = 0;
  for (let i = 0; i < 50; i++) {
    const result = await db.execute<{ id: string }>(sql`
      WITH doomed AS (
        SELECT id FROM api_logs
        WHERE timestamp < ${cutoffIso}::timestamptz
        ORDER BY timestamp ASC
        LIMIT 5000
      )
      DELETE FROM api_logs a
      USING doomed d
      WHERE a.id = d.id
      RETURNING a.id
    `);
    const n = result.length;
    deleted += n;
    if (n < 5000) break;
  }
  return deleted;
}

export type PruneJobResult = {
  aggregatedDays: number;
  deletedLogs: number;
  retentionDays: number;
  timezone: string;
};

export async function runPruneAndAnalyticsJob(): Promise<PruneJobResult> {
  const tz = analyticsTimezone();
  const retentionDays = logRetentionDays();
  const today = moment().tz(tz).format("YYYY-MM-DD");

  const days = await listDaysNeedingAggregation(tz, today);
  let aggregatedDays = 0;
  for (const day of days) {
    try {
      await aggregateDay(day, tz);
      aggregatedDays++;
    } catch (e) {
      console.error("[prune-analytics] aggregate failed", day, e);
    }
  }

  // Re-aggregate recent completed days still inside retention so dashboards stay fresh
  // when late logs arrive (bounded: last 2 completed days).
  const recent = [
    moment().tz(tz).subtract(1, "day").format("YYYY-MM-DD"),
    moment().tz(tz).subtract(2, "day").format("YYYY-MM-DD"),
  ];
  const sinceIso = moment().tz(tz).subtract(3, "days").startOf("day").toISOString();
  const projectRows = await db
    .selectDistinct({ projectId: apiLogs.projectId, environment: apiLogs.environment })
    .from(apiLogs)
    .where(gte(apiLogs.timestamp, new Date(sinceIso)));
  for (const p of projectRows) {
    for (const bucketDate of recent) {
      try {
        await aggregateDay({ projectId: p.projectId, environment: p.environment, bucketDate }, tz);
      } catch (e) {
        console.error("[prune-analytics] refresh failed", p, bucketDate, e);
      }
    }
  }

  const deletedLogs = await pruneOldLogs(retentionDays);
  return { aggregatedDays, deletedLogs, retentionDays, timezone: tz };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startPruneAnalyticsJob(): void {
  if (process.env.PRUNE_JOB_ENABLED === "0" || process.env.PRUNE_JOB_ENABLED === "false") {
    console.log("[prune-analytics] disabled via PRUNE_JOB_ENABLED");
    return;
  }
  if (timer) return;

  const interval = pruneIntervalMs();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runPruneAndAnalyticsJob();
      console.log("[prune-analytics]", result);
    } catch (e) {
      console.error("[prune-analytics] job failed", e);
    } finally {
      running = false;
    }
  };

  // Kick off shortly after boot so migrate/startup can finish first.
  setTimeout(() => void tick(), 15_000);
  timer = setInterval(() => void tick(), interval);
  console.log(`[prune-analytics] scheduled every ${interval}ms (retention=${logRetentionDays()}d tz=${analyticsTimezone()})`);
}

export function stopPruneAnalyticsJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Live + stored analytics for a date range (inclusive calendar days in `tz`). */
export async function queryAnalyticsRange(opts: {
  projectId: string;
  environment: string;
  dateFrom: string;
  dateTo: string;
  timeZone: string;
}) {
  const tz = opts.timeZone;
  const from = moment.tz(opts.dateFrom, "YYYY-MM-DD", true, tz).startOf("day");
  const to = moment.tz(opts.dateTo, "YYYY-MM-DD", true, tz).startOf("day");
  const start = from.isSameOrBefore(to) ? from : to;
  const end = from.isSameOrBefore(to) ? to : from;
  const today = moment().tz(tz).startOf("day");

  const storedFrom = start.format("YYYY-MM-DD");
  const storedToExclusive = end.clone().add(1, "day").format("YYYY-MM-DD");

  const stored = await db
    .select()
    .from(apiLogDailyAnalytics)
    .where(
      and(
        eq(apiLogDailyAnalytics.projectId, opts.projectId),
        eq(apiLogDailyAnalytics.environment, opts.environment),
        gte(apiLogDailyAnalytics.bucketDate, storedFrom),
        lt(apiLogDailyAnalytics.bucketDate, storedToExclusive),
      ),
    )
    .orderBy(asc(apiLogDailyAnalytics.bucketDate));

  const days: Array<{
    date: string;
    totalRequests: number;
    success2xx: number;
    clientError4xx: number;
    serverError5xx: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    uniquePaths: number;
    uniqueCallers: number;
    statusCodeDistribution: StatusDistribution;
    methodDistribution: MethodDistribution;
    topPaths: TopPathEntry[];
    topCallers: TopCallerEntry[];
    source: "analytics" | "live";
  }> = stored.map((r) => ({
    date: String(r.bucketDate),
    totalRequests: r.totalRequests,
    success2xx: r.success2xx,
    clientError4xx: r.clientError4xx,
    serverError5xx: r.serverError5xx,
    avgResponseTimeMs: r.avgResponseTimeMs,
    p95ResponseTimeMs: r.p95ResponseTimeMs,
    uniquePaths: r.uniquePaths,
    uniqueCallers: r.uniqueCallers,
    statusCodeDistribution: r.statusCodeDistribution,
    methodDistribution: r.methodDistribution,
    topPaths: r.topPaths,
    topCallers: r.topCallers,
    source: "analytics" as const,
  }));

  // Fill today (and any missing in-range days still in raw logs) from live data.
  const have = new Set(days.map((d) => d.date));
  const cursor = start.clone();
  while (cursor.isSameOrBefore(end, "day")) {
    const d = cursor.format("YYYY-MM-DD");
    if (!have.has(d) && cursor.isSameOrBefore(today, "day")) {
      const live = await liveDayStats(opts.projectId, opts.environment, d, tz);
      if (live) days.push({ ...live, source: "live" });
    }
    cursor.add(1, "day");
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  const summary = {
    totalRequests: 0,
    success2xx: 0,
    clientError4xx: 0,
    serverError5xx: 0,
    avgResponseTimeMs: 0,
    p95ResponseTimeMs: 0,
    uniquePaths: 0,
    uniqueCallers: 0,
  };
  let weightedAvg = 0;
  let weightedP95 = 0;
  const statusMerged: StatusDistribution = {};
  const methodMerged: MethodDistribution = {};
  const pathMerged = new Map<string, number>();
  const callerMerged = new Map<string, TopCallerEntry>();

  for (const d of days) {
    summary.totalRequests += d.totalRequests;
    summary.success2xx += d.success2xx;
    summary.clientError4xx += d.clientError4xx;
    summary.serverError5xx += d.serverError5xx;
    weightedAvg += d.avgResponseTimeMs * d.totalRequests;
    weightedP95 += d.p95ResponseTimeMs * d.totalRequests;
    for (const [k, v] of Object.entries(d.statusCodeDistribution)) {
      statusMerged[k] = (statusMerged[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(d.methodDistribution)) {
      methodMerged[k] = (methodMerged[k] ?? 0) + v;
    }
    for (const p of d.topPaths) pathMerged.set(p.path, (pathMerged.get(p.path) ?? 0) + p.count);
    for (const c of d.topCallers) {
      const key = c.callerId ?? c.name ?? "?";
      const prev = callerMerged.get(key);
      callerMerged.set(key, {
        callerId: c.callerId,
        name: c.name,
        count: (prev?.count ?? 0) + c.count,
      });
    }
  }

  if (summary.totalRequests > 0) {
    summary.avgResponseTimeMs = weightedAvg / summary.totalRequests;
    summary.p95ResponseTimeMs = weightedP95 / summary.totalRequests;
  }
  summary.uniquePaths = pathMerged.size;
  summary.uniqueCallers = callerMerged.size;

  const topPaths = [...pathMerged.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
  const topCallers = [...callerMerged.values()].sort((a, b) => b.count - a.count).slice(0, TOP_N);

  return {
    dateFrom: start.format("YYYY-MM-DD"),
    dateTo: end.format("YYYY-MM-DD"),
    timeZone: tz,
    summary: {
      ...summary,
      statusCodeDistribution: statusMerged,
      methodDistribution: methodMerged,
      topPaths,
      topCallers,
    },
    days,
  };
}

async function liveDayStats(projectId: string, environment: string, bucketDate: string, tz: string) {
  const { start, endExclusive } = dayBounds(bucketDate, tz);
  const baseWhere = and(
    eq(apiLogs.projectId, projectId),
    eq(apiLogs.environment, environment),
    gte(apiLogs.timestamp, start),
    lt(apiLogs.timestamp, endExclusive),
  );

  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      success2xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 200 AND ${apiLogs.statusCode} < 300)::int`,
      clientError4xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 400 AND ${apiLogs.statusCode} < 500)::int`,
      serverError5xx: sql<number>`count(*) FILTER (WHERE ${apiLogs.statusCode} >= 500)::int`,
      avgResponseTimeMs: sql<number>`coalesce(avg(${apiLogs.responseTimeMs}), 0)::float8`,
      p95ResponseTimeMs: sql<number>`coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${apiLogs.responseTimeMs}), 0)::float8`,
      uniquePaths: sql<number>`count(DISTINCT ${apiLogs.path})::int`,
      uniqueCallers: sql<number>`count(DISTINCT ${apiLogs.callerId})::int`,
    })
    .from(apiLogs)
    .where(baseWhere);

  if (!totals || Number(totals.totalRequests) === 0) return null;

  const statusRows = await db
    .select({ code: apiLogs.statusCode, cnt: sql<number>`count(*)::int` })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.statusCode);
  const statusCodeDistribution: StatusDistribution = {};
  for (const r of statusRows) statusCodeDistribution[String(r.code)] = Number(r.cnt);

  const methodRows = await db
    .select({ method: apiLogs.method, cnt: sql<number>`count(*)::int` })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.method);
  const methodDistribution: MethodDistribution = {};
  for (const r of methodRows) methodDistribution[r.method] = Number(r.cnt);

  const pathRows = await db
    .select({ path: apiLogs.path, cnt: sql<number>`count(*)::int` })
    .from(apiLogs)
    .where(baseWhere)
    .groupBy(apiLogs.path)
    .orderBy(sql`count(*) DESC`)
    .limit(TOP_N);

  const callerRows = await db
    .select({
      callerId: apiLogs.callerId,
      name: callers.name,
      cnt: sql<number>`count(*)::int`,
    })
    .from(apiLogs)
    .leftJoin(callers, eq(apiLogs.callerId, callers.id))
    .where(and(baseWhere, sql`${apiLogs.callerId} IS NOT NULL`))
    .groupBy(apiLogs.callerId, callers.name)
    .orderBy(sql`count(*) DESC`)
    .limit(TOP_N);

  return {
    date: bucketDate,
    totalRequests: Number(totals.totalRequests),
    success2xx: Number(totals.success2xx),
    clientError4xx: Number(totals.clientError4xx),
    serverError5xx: Number(totals.serverError5xx),
    avgResponseTimeMs: Number(totals.avgResponseTimeMs),
    p95ResponseTimeMs: Number(totals.p95ResponseTimeMs),
    uniquePaths: Number(totals.uniquePaths),
    uniqueCallers: Number(totals.uniqueCallers),
    statusCodeDistribution,
    methodDistribution,
    topPaths: pathRows.map((r) => ({ path: r.path, count: Number(r.cnt) })),
    topCallers: callerRows.map((r) => ({
      callerId: r.callerId,
      name: r.name,
      count: Number(r.cnt),
    })),
  };
}
