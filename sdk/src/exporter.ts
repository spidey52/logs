import axios, { type AxiosInstance, isAxiosError } from "axios";
import type { ApiLogBatchItem, ApiLogEnvironment } from "./types.js";

export type ApiLogExporterOptions = {
  /** e.g. `https://logs.example.com` — no trailing slash */
  baseUrl: string;
  apiKey: string;
  environment: ApiLogEnvironment;
  /** Flush when the queue reaches this size (default 100). */
  batchSize?: number;
  /** Sends `createCallers: true` so `caller_identifier` / `caller_name` upsert on the server. */
  createCallers?: boolean;
  flushIntervalMs?: number;
  /**
   * Optional shared axios instance (must have compatible `baseURL` / auth if you replace defaults).
   * If omitted, an instance is created with `baseUrl` and ingest headers.
   */
  axios?: AxiosInstance;
  onError?: (err: Error, context: { phase: "upload" }) => void;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function uploadErrorMessage(e: unknown): string {
  if (isAxiosError(e)) {
    const st = e.response?.status;
    const data = e.response?.data;
    const body =
      typeof data === "object" && data && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : typeof data === "string"
          ? data.slice(0, 200)
          : "";
    return `api-logs batch failed: HTTP ${st ?? "?"} ${body || e.message}`.trim();
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Queues rows in memory and POSTs to `/api/v1/logs/batch` in chunks of {@link batchSize} (default 100).
 */
export class ApiLogExporter {
  readonly batchSize: number;
  private readonly http: AxiosInstance;
  private readonly createCallers: boolean;
  private readonly onError?: ApiLogExporterOptions["onError"];

  private queue: ApiLogBatchItem[] = [];
  private interval: ReturnType<typeof setInterval> | undefined;
  private drainChain: Promise<void> = Promise.resolve();

  constructor(opts: ApiLogExporterOptions) {
    const baseURL = normalizeBaseUrl(opts.baseUrl);
    this.batchSize = Math.max(1, Math.min(1000, opts.batchSize ?? 100));
    this.createCallers = opts.createCallers ?? true;
    this.onError = opts.onError;

    this.http =
      opts.axios ??
      axios.create({
        baseURL,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": opts.apiKey,
          "X-Environment": opts.environment,
        },
      });

    if (opts.flushIntervalMs != null && opts.flushIntervalMs > 0) {
      this.interval = setInterval(() => {
        void this.flushFullBatches();
      }, opts.flushIntervalMs);
    }
  }

  enqueue(item: ApiLogBatchItem): void {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      this.drainChain = this.drainChain.then(() => this.flushFullBatches());
    }
  }

  async flushFullBatches(): Promise<void> {
    while (this.queue.length >= this.batchSize) {
      const logs = this.queue.splice(0, this.batchSize);
      await this.upload(logs);
    }
  }

  async shutdown(): Promise<void> {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    await this.drainChain;
    while (this.queue.length > 0) {
      const logs = this.queue.splice(0, this.batchSize);
      await this.upload(logs);
    }
  }

  get queued(): number {
    return this.queue.length;
  }

  private async upload(logs: ApiLogBatchItem[]): Promise<void> {
    if (!logs.length) return;
    const body: { createCallers?: boolean; logs: ApiLogBatchItem[] } = { logs };
    if (this.createCallers) body.createCallers = true;
    try {
      await this.http.post("/api/v1/logs/batch", body);
    } catch (e) {
      const err = new Error(uploadErrorMessage(e));
      this.onError?.(err, { phase: "upload" });
      this.queue.unshift(...logs);
    }
  }
}
