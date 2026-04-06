CREATE TABLE "api_log_bodies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"log_id" uuid NOT NULL,
	"request_body" jsonb,
	"response_body" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_log_headers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"log_id" uuid NOT NULL,
	"request_content_type" text,
	"request_accept" text,
	"request_authorization" text,
	"request_origin" text,
	"request_referer" text,
	"request_x_forwarded_for" text,
	"request_x_request_id" text,
	"response_content_type" text,
	"response_cache_control" text,
	"response_etag" text,
	"response_location" text,
	"response_x_request_id" text,
	"request_headers_extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_headers_extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"params" jsonb,
	"query_params" jsonb,
	"status_code" integer NOT NULL,
	"response_time_ms" bigint DEFAULT 0 NOT NULL,
	"content_length" bigint DEFAULT 0 NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"caller_id" uuid,
	"trace_id" text,
	"span_id" text,
	"service" text,
	"host" text,
	"request_id" text,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"identifier" text NOT NULL,
	"email" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"api_key" text NOT NULL,
	"environment" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "projects_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
ALTER TABLE "api_log_bodies" ADD CONSTRAINT "api_log_bodies_log_id_api_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."api_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_log_headers" ADD CONSTRAINT "api_log_headers_log_id_api_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."api_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_caller_id_callers_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."callers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callers" ADD CONSTRAINT "callers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_log_bodies_log_id_unq" ON "api_log_bodies" USING btree ("log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_log_headers_log_id_unq" ON "api_log_headers" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "api_logs_project_ts_idx" ON "api_logs" USING btree ("project_id","timestamp");--> statement-breakpoint
CREATE INDEX "api_logs_project_env_ts_idx" ON "api_logs" USING btree ("project_id","environment","timestamp");--> statement-breakpoint
CREATE INDEX "api_logs_trace_id_idx" ON "api_logs" USING btree ("project_id","trace_id");--> statement-breakpoint
CREATE INDEX "api_logs_service_ts_idx" ON "api_logs" USING btree ("project_id","service","timestamp");--> statement-breakpoint
CREATE INDEX "api_logs_status_code_idx" ON "api_logs" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "api_logs_method_idx" ON "api_logs" USING btree ("method");--> statement-breakpoint
CREATE INDEX "api_logs_caller_id_idx" ON "api_logs" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "api_logs_project_ts_id_idx" ON "api_logs" USING btree ("project_id","timestamp","id");--> statement-breakpoint
CREATE UNIQUE INDEX "callers_project_identifier_unq" ON "callers" USING btree ("project_id","identifier");--> statement-breakpoint
CREATE INDEX "callers_created_at_idx" ON "callers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_environment_idx" ON "projects" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");