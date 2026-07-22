import { createApp } from "./app";
import "./db";
import { startPruneAnalyticsJob } from "./jobs/pruneAnalytics";

const app = createApp();
startPruneAnalyticsJob();

export default {
  port: Number(process.env.PORT ?? 8080),
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: app.fetch,
};
