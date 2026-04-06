export type LogSortField = "timestamp" | "method" | "status_code" | "response_time_ms" | "path" | "caller";

export type DecodedLogsCursor = {
  sort: LogSortField;
  order: "asc" | "desc";
  id: string;
  timestampIso: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  path: string;
  callerKey: string;
};

export function encodeLogsListCursor(payload: Omit<DecodedLogsCursor, "sort" | "order"> & { sort: LogSortField; order: "asc" | "desc" }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeLogsListCursor(
  encoded: string,
  expectedSort: LogSortField,
  expectedOrder: "asc" | "desc",
): DecodedLogsCursor | null {
  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    const j = JSON.parse(raw) as Record<string, unknown>;

    if (typeof j.i !== "string") return null;

    if (j.s == null && j.t != null) {
      if (expectedSort !== "timestamp" || expectedOrder !== "desc") return null;
      const sort: LogSortField = "timestamp";
      const order: "asc" | "desc" = "desc";
      const timestampIso = typeof j.t === "string" ? j.t : "";
      if (!timestampIso) return null;
      return {
        sort,
        order,
        id: j.i,
        timestampIso,
        method: "",
        statusCode: 0,
        responseTimeMs: 0,
        path: "",
        callerKey: "",
      };
    }

    const sort = j.s as LogSortField;
    const order = j.d as "asc" | "desc";
    if (sort !== expectedSort || order !== expectedOrder) return null;
    if (typeof j.t !== "string" || typeof j.m !== "string" || typeof j.p !== "string") return null;
    const sc = typeof j.sc === "number" ? j.sc : Number(j.sc);
    const rt = typeof j.rt === "number" ? j.rt : Number(j.rt);
    if (Number.isNaN(sc) || Number.isNaN(rt)) return null;
    return {
      sort,
      order,
      id: j.i,
      timestampIso: j.t,
      method: j.m,
      statusCode: sc,
      responseTimeMs: rt,
      path: j.p,
      callerKey: typeof j.cn === "string" ? j.cn : "",
    };
  } catch {
    return null;
  }
}
