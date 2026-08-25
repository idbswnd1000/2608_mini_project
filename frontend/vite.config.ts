import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backendTarget =
    env.VITE_BACKEND_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],

    server: {
      host: "0.0.0.0",
      port: 5173,

      proxy: {
        "/rag": {
          target: backendTarget,
          changeOrigin: true,
        },

        "/presentation": {
          target: backendTarget,
          changeOrigin: true,
        },

        "/evaluation": {
          target: backendTarget,
          changeOrigin: true,
        },

        "/health": {
          target: backendTarget,
          changeOrigin: true,
        },

        "/lecture-control": {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});