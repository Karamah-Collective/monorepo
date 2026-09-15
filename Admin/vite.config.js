import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
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
      },
    },
  },
});
