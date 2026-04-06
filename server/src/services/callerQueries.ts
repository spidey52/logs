import { and, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { callers } from "../db/schema";
import { encodeCursor } from "../lib/cursor";

function cursorPredicate(cursor: { at: Date; id: string }): SQL {
  return sql`ROW(${callers.createdAt}, ${callers.id}) < ROW(${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
}

export async function queryCallersPage(opts: {
  projectId?: string;
  limit: number;
  cursor: { at: Date; id: string } | null;
  withCount: boolean;
}): Promise<{
  rows: (typeof callers.$inferSelect)[];
  nextCursor: string | null;
  total: number | null;
}> {
  const parts: SQL[] = [];
  if (opts.projectId) parts.push(eq(callers.projectId, opts.projectId));
  if (opts.cursor) parts.push(cursorPredicate(opts.cursor));
  const where = parts.length ? and(...parts) : undefined;

  if (opts.withCount) {
    const rows = await db
      .select({
        ...getTableColumns(callers),
        _total: sql<string>`(count(*) over ())::text`,
      })
      .from(callers)
      .where(where)
      .orderBy(desc(callers.createdAt), desc(callers.id))
      .limit(opts.limit);

    if (!rows.length) {
      return { rows: [], nextCursor: null, total: 0 };
    }
    const total = Number(rows[0]!._total);
    const clean = rows.map(({ _total: _t, ...r }) => r) as (typeof callers.$inferSelect)[];
    const last = clean[clean.length - 1]!;
    const nextCursor =
      clean.length === opts.limit ? encodeCursor(last.createdAt, last.id) : null;
    return { rows: clean, nextCursor, total };
  }

  const clean = await db
    .select()
    .from(callers)
    .where(where)
    .orderBy(desc(callers.createdAt), desc(callers.id))
    .limit(opts.limit);

  const last = clean[clean.length - 1];
  const nextCursor =
    last && clean.length === opts.limit ? encodeCursor(last.createdAt, last.id) : null;
  return { rows: clean, nextCursor, total: null };
}
