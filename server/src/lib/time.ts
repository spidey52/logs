import moment from "moment-timezone";

/** Wall-clock instant for DB writes (UTC). */
export function now(): Date {
  return moment.utc().toDate();
}

/**
 * Resolve IANA zone from `X-Timezone` (e.g. from `Intl.DateTimeFormat().resolvedOptions().timeZone`).
 * Invalid or missing values fall back to UTC so API clients keep working.
 */
export function resolveRequestTimezone(header: string | undefined): string {
  const t = header?.trim();
  if (!t) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return t;
  } catch {
    return "UTC";
  }
}

export { moment };
