CREATE TABLE "api_log_daily_analytics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"bucket_date" date NOT NULL,
	"total_requests" bigint DEFAULT 0 NOT NULL,
	"success_2xx" bigint DEFAULT 0 NOT NULL,
	"client_error_4xx" bigint DEFAULT 0 NOT NULL,
	"server_error_5xx" bigint DEFAULT 0 NOT NULL,
	"avg_response_time_ms" double precision DEFAULT 0 NOT NULL,
	"p95_response_time_ms" double precision DEFAULT 0 NOT NULL,
	"unique_paths" integer DEFAULT 0 NOT NULL,
	"unique_callers" integer DEFAULT 0 NOT NULL,
	"status_code_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"method_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"top_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_callers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_log_daily_analytics" ADD CONSTRAINT "api_log_daily_analytics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_log_daily_analytics_project_env_date_unq" ON "api_log_daily_analytics" USING btree ("project_id","environment","bucket_date");--> statement-breakpoint
CREATE INDEX "api_log_daily_analytics_project_date_idx" ON "api_log_daily_analytics" USING btree ("project_id","bucket_date");