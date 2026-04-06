import type { Context } from "hono";

export function clientIp(c: Context): string {
  const xf = c.req.header("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip") ?? "unknown";
}
