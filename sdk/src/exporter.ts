import axios, { type AxiosInstance, isAxiosError } from "axios";
import Redis from "ioredis";
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
  redisUrl: string;
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
  private readonly redis: Redis;
  private readonly redisUrl: string;

  constructor(opts: ApiLogExporterOptions) {
    const baseURL = normalizeBaseUrl(opts.baseUrl);
    this.batchSize = Math.max(1, Math.min(1000, opts.batchSize ?? 100));
    this.createCallers = opts.createCallers ?? true;
    this.onError = opts.onError;

    this.redisUrl = opts.redisUrl;
    this.redis = new Redis(opts.redisUrl, { keyPrefix: "api-logs" });

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

    this.startFlushing();
  }

  async enqueue(item: ApiLogBatchItem): Promise<void> {
    await this.redis.lpush("batch", JSON.stringify(item));
  }

  async flushFullBatches(): Promise<void> {
    // const logs = await this.redis.lrange("batch", 0, this.batchSize - 1);
    // await this.upload(logs.map(JSON.parse) as ApiLogBatchItem[]);
  }

  private async startFlushing(): Promise<void> {
    const redis = new Redis(this.redisUrl, { keyPrefix: "api-logs" });
    while (true) {
      const log = await redis.brpop("batch", 0);
      if (!log) continue;

      const batch: ApiLogBatchItem[] = [];

      const logItem = JSON.parse(log[1]) as ApiLogBatchItem;
      batch.push(logItem);

      // get next batchSize logs
      const nextLogs = await redis.lpop("batch", this.batchSize);

      if (nextLogs?.length) {
        batch.push(...nextLogs.map((log) => JSON.parse(log) as ApiLogBatchItem));
      }

      await this.upload(batch);

    }
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
      // this.queue.unshift(...logs);
    }
  }
}
