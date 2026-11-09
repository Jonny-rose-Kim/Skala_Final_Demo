import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Optional operational backend (not part of V1). The proxy is harmless when nothing listens;
    // the Visual Inspection mode never calls these endpoints on its own.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
  // Babylon shader sources are plain strings; no special handling required.
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
