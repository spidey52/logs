/** Shared env knobs for retention / analytics calendar. */

export function analyticsTimezone(): string {
  return process.env.ANALYTICS_TIMEZONE?.trim() || "UTC";
}

export function logRetentionDays(): number {
  const n = Number(process.env.LOG_RETENTION_DAYS ?? 14);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 14;
}
