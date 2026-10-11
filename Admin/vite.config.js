import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getBuildVersion } from "../tooling/build-version.mjs";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(getBuildVersion()) },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/website-api": {
        target: "http://127.0.0.1:8789",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/website-api/, '/api'),
      },
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
        ws: true,
      },
      "/forms-api": {
        target: "http://127.0.0.1:8791",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/forms-api/, "/api"),
      },
    },
  },
});
