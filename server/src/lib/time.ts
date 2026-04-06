import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(customParseFormat);
dayjs.extend(timezone);

/** Wall-clock instant for DB writes (UTC). */
export function now(): Date {
  return dayjs.utc().toDate();
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

/** Start of the current calendar day in `timeZone` (as absolute `Date`). */
export function startOfLocalDay(timeZone: string): Date {
  return dayjs().tz(timeZone).startOf("day").toDate();
}

export { dayjs };
