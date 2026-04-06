export function encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: timestamp.toISOString(), i: id }), "utf8").toString("base64url");
}

export function decodeCursor(s: string): { at: Date; id: string } | null {
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const j = JSON.parse(raw) as { t?: string; i?: string };
    if (typeof j.t !== "string" || typeof j.i !== "string") return null;
    const at = new Date(j.t);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id: j.i };
  } catch {
    return null;
  }
}
