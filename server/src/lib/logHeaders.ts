export type PartitionedLogHeaderColumns = {
  requestContentType?: string | null;
  requestAccept?: string | null;
  requestAuthorization?: string | null;
  requestOrigin?: string | null;
  requestReferer?: string | null;
  requestXForwardedFor?: string | null;
  requestXRequestId?: string | null;
  responseContentType?: string | null;
  responseCacheControl?: string | null;
  responseEtag?: string | null;
  responseLocation?: string | null;
  responseXRequestId?: string | null;
};

const REQ_KEYS: Record<string, keyof PartitionedLogHeaderColumns> = {
  "content-type": "requestContentType",
  accept: "requestAccept",
  authorization: "requestAuthorization",
  origin: "requestOrigin",
  referer: "requestReferer",
  referrer: "requestReferer",
  "x-forwarded-for": "requestXForwardedFor",
  "x-request-id": "requestXRequestId",
};

const RES_KEYS: Record<string, keyof PartitionedLogHeaderColumns> = {
  "content-type": "responseContentType",
  "cache-control": "responseCacheControl",
  etag: "responseEtag",
  location: "responseLocation",
  "x-request-id": "responseXRequestId",
};

function asHeaderString(v: unknown, maxLen: number): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : String(v);
  const t = s.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

export function partitionLogHeaders(
  req?: Record<string, unknown>,
  res?: Record<string, unknown>,
): {
  columns: PartitionedLogHeaderColumns;
  requestHeadersExtra: Record<string, unknown>;
  responseHeadersExtra: Record<string, unknown>;
  hasAny: boolean;
} {
  const columns: PartitionedLogHeaderColumns = {};
  const requestHeadersExtra: Record<string, unknown> = {};
  const responseHeadersExtra: Record<string, unknown> = {};

  if (req) {
    for (const [k, v] of Object.entries(req)) {
      const lk = k.toLowerCase();
      const field = REQ_KEYS[lk];
      const str = asHeaderString(v, lk === "authorization" ? 2048 : 8192);
      if (field) {
        if (field === "requestReferer" && columns.requestReferer != null) continue;
        (columns as Record<string, string | null | undefined>)[field] = str;
      } else if (v !== undefined) {
        requestHeadersExtra[k] = v;
      }
    }
  }

  if (res) {
    for (const [k, v] of Object.entries(res)) {
      const lk = k.toLowerCase();
      const field = RES_KEYS[lk];
      const str = asHeaderString(v, 8192);
      if (field) {
        (columns as Record<string, string | null | undefined>)[field] = str;
      } else if (v !== undefined) {
        responseHeadersExtra[k] = v;
      }
    }
  }

  const hasKnownColumn = Object.values(columns).some((x) => x != null && String(x) !== "");
  const hasAny =
    hasKnownColumn ||
    Object.keys(requestHeadersExtra).length > 0 ||
    Object.keys(responseHeadersExtra).length > 0;

  return {
    columns,
    requestHeadersExtra,
    responseHeadersExtra,
    hasAny,
  };
}
