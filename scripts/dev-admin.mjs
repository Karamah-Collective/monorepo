import { spawn } from "node:child_process";
import path from "node:path";
import net from "node:net";
import { root, wrangler, setupLocalDatabase } from "./local-db.mjs";

const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
function launch(script, args) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: root, windowsHide: true, stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  children.add(child);
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => { children.delete(child); stop(code || 0); });
  return child;
}
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
try {
  if (!await portInUse(8788)) {
    console.info("Preparing local map API and database (production is untouched)…");
    await setupLocalDatabase();
    launch(wrangler, ["pages", "dev", ".", "--port", "8788", "--ip", "127.0.0.1"]);
  } else console.info("Using the API already running at http://127.0.0.1:8788");
  launch(path.join(root, "admin/node_modules/vite/bin/vite.js"), [path.join(root, "admin"), "--config", path.join(root, "admin/vite.config.js"), "--strictPort"]);
} catch (error) {
  console.error(error.message);
  console.error("Install root dependencies with: npm install --prefix ..");
  stop(1);
}
