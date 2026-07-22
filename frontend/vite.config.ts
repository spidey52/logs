import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Prefer server/.env PORT so the UI proxy matches the API.
  const serverEnv = loadEnv(mode, "../server", "");
  const apiPort = serverEnv.PORT || process.env.API_PORT || "8080";
  const apiTarget = process.env.VITE_PROXY_TARGET || `http://localhost:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
