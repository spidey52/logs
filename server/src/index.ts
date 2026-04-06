import { createApp } from "./app";
import "./db";

const app = createApp();

export default {
  port: Number(process.env.PORT ?? 8080),
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: app.fetch,
};
