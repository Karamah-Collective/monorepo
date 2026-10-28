import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startBackgroundLocalPreviewSync } from "./local-preview-sync.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(projectDir, "..");
const wrangler = path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js");
const persistTo = process.env.KARAMAH_LOCAL_STATE || path.join(projectDir, ".wrangler", "state");
const port = process.env.PORT || "8788";

startBackgroundLocalPreviewSync("maps_v3");
const child = spawn(process.execPath, [
  wrangler, "pages", "dev", ".", "--port", port, "--ip", "127.0.0.1", "--persist-to", persistTo,
], { cwd: projectDir, windowsHide: true, stdio: "inherit" });

const stop = () => {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => { process.exitCode = code || 0; });
