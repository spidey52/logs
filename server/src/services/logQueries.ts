import { and, asc, avg, count, desc, eq, getTableColumns, gte, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { encodeLogsListCursor, type DecodedLogsCursor, type LogSortField } from "../lib/logsCursor";
import { startOfLocalDay } from "../lib/time";
import { db } from "../db";
import { apiLogs, callers } from "../db/schema";

export type { LogSortField };

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
  statusCode?: number;
  statusCodeMin?: number;
  statusCodeMax?: number;
  path?: string;
  search?: string;
  traceId?: string;
  service?: string;
  callerId?: string;
  fromDate?: Date;
  toDate?: Date;
};

function logWhereParts(filter: LogFilter) {
  const parts = [eq(apiLogs.projectId, filter.projectId)];
  if (filter.environment) parts.push(eq(apiLogs.environment, filter.environment));
  if (filter.method) parts.push(eq(apiLogs.method, filter.method));
  if (filter.statusCode != null) {
    parts.push(eq(apiLogs.statusCode, filter.statusCode));
  } else {
    if (filter.statusCodeMin != null) parts.push(gte(apiLogs.statusCode, filter.statusCodeMin));
    if (filter.statusCodeMax != null) parts.push(lte(apiLogs.statusCode, filter.statusCodeMax));
  }
  if (filter.path) parts.push(ilikeContains(apiLogs.path, filter.path));
  if (filter.search) {
    parts.push(
      or(
        ilikeContains(apiLogs.path, filter.search),
        ilikeContains(apiLogs.userAgent, filter.search),
        ilikeContains(apiLogs.ipAddress, filter.search),
      )!,
    );
  }
  if (filter.traceId) parts.push(eq(apiLogs.traceId, filter.traceId));
  if (filter.service) parts.push(eq(apiLogs.service, filter.service));
  if (filter.callerId) parts.push(eq(apiLogs.callerId, filter.callerId));
  if (filter.fromDate) parts.push(gte(apiLogs.timestamp, filter.fromDate));
  if (filter.toDate) parts.push(lte(apiLogs.timestamp, filter.toDate));
  return and(...parts);
}

function keysetWhere(cursor: DecodedLogsCursor, sort: LogSortField): SQL {
  const op = cursor.order === "desc" ? sql` < ` : sql` > `;
  const cid = cursor.id;
  switch (sort) {
    case "timestamp":
      return sql`ROW(${apiLogs.timestamp}, ${apiLogs.id})${op}ROW(${cursor.timestampIso}::timestamptz, ${cid}::uuid)`;
    case "method":
      return sql`ROW(${apiLogs.method}, ${apiLogs.id})${op}ROW(${cursor.method}, ${cid}::uuid)`;
    case "status_code":
      return sql`ROW(${apiLogs.statusCode}, ${apiLogs.id})${op}ROW(${cursor.statusCode}, ${cid}::uuid)`;
    case "response_time_ms":
      return sql`ROW(${apiLogs.responseTimeMs}, ${apiLogs.id})${op}ROW(${cursor.responseTimeMs}, ${cid}::uuid)`;
    case "path":
      return sql`ROW(${apiLogs.path}, ${apiLogs.id})${op}ROW(${cursor.path}, ${cid}::uuid)`;
    case "caller": {
      const ck = cursor.callerKey;
      return sql`ROW(COALESCE(${callers.name}, ''), ${apiLogs.id})${op}ROW(${ck}, ${cid}::uuid)`;
    }
    default:
      return sql`ROW(${apiLogs.timestamp}, ${apiLogs.id})${op}ROW(${cursor.timestampIso}::timestamptz, ${cid}::uuid)`;
  }
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

type RowWithMeta = typeof apiLogs.$inferSelect & { _cn?: string | null; _total?: string };

function stripRow(r: RowWithMeta): typeof apiLogs.$inferSelect {
  const { _cn: _c, _total: _t, ...rest } = r;
  return rest;
}

function encodeRowCursor(row: typeof apiLogs.$inferSelect, sort: LogListSort, callerName: string | null | undefined): string {
  return encodeLogsListCursor({
    sort: sort.field,
    order: sort.order,
    id: row.id,
    timestampIso: row.timestamp.toISOString(),
    method: row.method,
    statusCode: row.statusCode,
    responseTimeMs: row.responseTimeMs,
    path: row.path,
    callerKey: sort.field === "caller" ? (callerName ?? "") : "",
  });
}

export async function queryLogsPage(
  filter: LogFilter,
  opts: { limit: number; cursor: DecodedLogsCursor | null; withCount: boolean; sort: LogListSort },
): Promise<{
  rows: (typeof apiLogs.$inferSelect)[];
  nextCursor: string | null;
  total: number | null;
}> {
  const base = logWhereParts(filter);
  const { sort } = opts;
  const useCallerJoin = sort.field === "caller";
  const keyset = opts.cursor ? keysetWhere(opts.cursor, sort.field) : undefined;
  const where = keyset ? and(base, keyset) : base;
  const ob = orderByClause(sort.field, sort.order);

  if (opts.withCount) {
    if (useCallerJoin) {
      const rows = await db
        .select({
          ...getTableColumns(apiLogs),
          _cn: callers.name,
          _total: sql<string>`(count(*) over ())::text`,
        })
        .from(apiLogs)
        .leftJoin(callers, eq(apiLogs.callerId, callers.id))
        .where(where)
        .orderBy(...ob)
        .limit(opts.limit);

      if (!rows.length) {
        return { rows: [], nextCursor: null, total: 0 };
      }
      const total = Number(rows[0]!._total);
      const clean = rows.map((r) => stripRow(r));
      const lastFull = rows[rows.length - 1]!;
      const last = clean[clean.length - 1]!;
      const nextCursor =
        clean.length === opts.limit ? encodeRowCursor(last, sort, lastFull._cn ?? null) : null;
      return { rows: clean, nextCursor, total };
    }

    const rows = await db
      .select({
        ...getTableColumns(apiLogs),
        _total: sql<string>`(count(*) over ())::text`,
      })
      .from(apiLogs)
      .where(where)
      .orderBy(...ob)
      .limit(opts.limit);

    if (!rows.length) {
      return { rows: [], nextCursor: null, total: 0 };
    }
    const total = Number(rows[0]!._total);
    const clean = rows.map((r) => stripRow(r));
    const last = clean[clean.length - 1]!;
    const nextCursor = clean.length === opts.limit ? encodeRowCursor(last, sort, null) : null;
    return { rows: clean, nextCursor, total };
  }

  if (useCallerJoin) {
    const rows = await db
      .select({
        ...getTableColumns(apiLogs),
        _cn: callers.name,
      })
      .from(apiLogs)
      .leftJoin(callers, eq(apiLogs.callerId, callers.id))
      .where(where)
      .orderBy(...ob)
      .limit(opts.limit);

    const clean = rows.map((r) => stripRow(r));
    const lastFull = rows[rows.length - 1];
    const last = clean[clean.length - 1];
    const nextCursor =
      last && clean.length === opts.limit ? encodeRowCursor(last, sort, lastFull?._cn ?? null) : null;
    return { rows: clean, nextCursor, total: null };
  }

  const clean = await db.select().from(apiLogs).where(where).orderBy(...ob).limit(opts.limit);

  const last = clean[clean.length - 1];
  const nextCursor =
    last && clean.length === opts.limit ? encodeRowCursor(last, sort, null) : null;
  return { rows: clean, nextCursor, total: null };
}

export async function countLogsSinceStartOfDay(projectId: string, environment: string, timeZone: string) {
  const start = startOfLocalDay(timeZone);
  const [row] = await db
    .select({ n: count() })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)));
  return Number(row?.n ?? 0);
}

export async function statusCodeDistribution(projectId: string, environment: string, timeZone: string) {
  const start = startOfLocalDay(timeZone);
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
  const start = startOfLocalDay(timeZone);
  const [row] = await db
    .select({ avgMs: avg(apiLogs.responseTimeMs) })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)));
  const v = row?.avgMs;
  if (v == null || v === "") return 0;
  return Number(v);
}

export async function distinctPaths(projectId: string, environment: string, timeZone: string) {
  const start = startOfLocalDay(timeZone);
  const rows = await db
    .selectDistinct({ path: apiLogs.path })
    .from(apiLogs)
    .where(and(eq(apiLogs.projectId, projectId), eq(apiLogs.environment, environment), gte(apiLogs.timestamp, start)))
    .orderBy(asc(apiLogs.path));
  return rows.map((r) => r.path);
}
