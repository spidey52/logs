import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    apiKey: text("api_key").notNull().unique(),
    environment: text("environment").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("projects_environment_idx").on(t.environment),
    index("projects_created_at_idx").on(t.createdAt),
  ]
);

/** Who invoked the instrumented API (per project). */
export const callers = pgTable(
  "callers",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    identifier: text("identifier").notNull(),
    email: text("email"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("callers_project_identifier_unq").on(t.projectId, t.identifier),
    index("callers_created_at_idx").on(t.createdAt),
  ]
);

export const apiLogs = pgTable(
  "api_logs",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    params: jsonb("params").$type<Record<string, string> | null>(),
    queryParams: jsonb("query_params").$type<Record<string, string> | null>(),
    statusCode: integer("status_code").notNull(),
    responseTimeMs: bigint("response_time_ms", { mode: "number" }).notNull().default(0),
    contentLength: bigint("content_length", { mode: "number" }).notNull().default(0),
    ipAddress: text("ip_address").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    callerId: uuid("caller_id").references(() => callers.id, { onDelete: "set null" }),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    service: text("service"),
    host: text("host"),
    requestId: text("request_id"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("api_logs_project_ts_idx").on(t.projectId, t.timestamp),
    index("api_logs_project_env_ts_idx").on(t.projectId, t.environment, t.timestamp),
    index("api_logs_trace_id_idx").on(t.projectId, t.traceId),
    index("api_logs_service_ts_idx").on(t.projectId, t.service, t.timestamp),
    index("api_logs_status_code_idx").on(t.statusCode),
    index("api_logs_method_idx").on(t.method),
    index("api_logs_caller_id_idx").on(t.callerId),
    index("api_logs_project_ts_id_idx").on(t.projectId, t.timestamp, t.id),
  ],
);

/** Well-known headers in columns; remainder in *_extra jsonb. */
export const apiLogHeaders = pgTable(
  "api_log_headers",
  {
    id: uuid("id").primaryKey(),
    logId: uuid("log_id")
      .notNull()
      .references(() => apiLogs.id, { onDelete: "cascade" }),
    requestContentType: text("request_content_type"),
    requestAccept: text("request_accept"),
    requestAuthorization: text("request_authorization"),
    requestOrigin: text("request_origin"),
    requestReferer: text("request_referer"),
    requestXForwardedFor: text("request_x_forwarded_for"),
    requestXRequestId: text("request_x_request_id"),
    responseContentType: text("response_content_type"),
    responseCacheControl: text("response_cache_control"),
    responseEtag: text("response_etag"),
    responseLocation: text("response_location"),
    responseXRequestId: text("response_x_request_id"),
    requestHeadersExtra: jsonb("request_headers_extra").$type<Record<string, unknown>>().notNull().default({}),
    responseHeadersExtra: jsonb("response_headers_extra").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("api_log_headers_log_id_unq").on(t.logId),
  ],
);

export const apiLogBodies = pgTable(
  "api_log_bodies",
  {
    id: uuid("id").primaryKey(),
    logId: uuid("log_id")
      .notNull()
      .references(() => apiLogs.id, { onDelete: "cascade" }),
    requestBody: jsonb("request_body"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("api_log_bodies_log_id_unq").on(t.logId),
  ],
);
