const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" as const;

/** Opaque ingest key: URL-safe, high entropy, no environment embedded in the string. */
export function newApiKey(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    out += ALPH[b % 64]!;
  }
  return `ak_${out}`;
}
