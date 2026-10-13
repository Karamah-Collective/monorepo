import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import packageJson from "./package.json" with { type: "json" };

const reactRuntime = process.env.VITEST
  ? path.resolve(__dirname, "../node_modules/react")
  : path.resolve(__dirname, "./node_modules/react");
const reactDomRuntime = process.env.VITEST
  ? path.resolve(__dirname, "../node_modules/react-dom")
  : path.resolve(__dirname, "./node_modules/react-dom");

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5184,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8788", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["node_modules/**", "dist/**", "tests/**/*.spec.js"],
    server: {
      deps: {
        inline: [
          "@testing-library/react",
          "react",
          "react-dom",
          /^@base-ui\//,
          /^@radix-ui\//,
        ],
      },
    },
  },
  resolve: {
    // Production uses Projects' React 19 runtime. Vitest runs from the
    // monorepo root, so use the hoisted React 18 pair for tests to ensure the
    // renderer and every dependency resolve to one runtime.
    alias: {
      react: reactRuntime,
      "react-dom": reactDomRuntime,
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "./i18n"),
      "@karamah/projects-libs": path.resolve(__dirname, "./src/lib/projects-client.ts"),
      "@karamah/projects-permissions": path.resolve(__dirname, "./vendor/projects-permissions/src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
});
