import { randomInt } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = path.resolve(root, "..");
const wrangler = path.join(repo, "node_modules", "wrangler", "bin", "wrangler.js");
const alphabet = "abcdefghijklmnopqrstuvwxyz123456789";
const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const persist = mode === "--local" ? ["--persist-to", path.join(repo, "Maps", ".wrangler", "state")] : [];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const output = [], errors = [];
    child.stdout.on("data", chunk => output.push(chunk)); child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", reject); child.on("exit", status => status === 0 ? resolve(Buffer.concat(output).toString()) : reject(new Error(Buffer.concat(errors).toString() || `Wrangler exited ${status}`)));
  });
}
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
const isShort = value => /^[a-z1-9]{3}$/.test(value || "");
const isLong = value => /^[A-Za-z0-9_-]{8,32}$/.test(value || "");
function nextShort(used) {
  let value;
  do value = Array.from({ length: 3 }, () => alphabet[randomInt(alphabet.length)]).join(""); while (used.has(value) || !/[a-z]/.test(value));
  used.add(value); return value;
}

await run(["d1", "execute", "forms-db", mode, ...persist, "--file", path.join(repo, "Maps", "migrations", "0024_form_share_code_aliases.sql")]);
const result = JSON.parse(await run(["d1", "execute", "forms-db", mode, ...persist, "--json", "--command", "SELECT f.id,f.share_code,a.code alias_code FROM forms f LEFT JOIN form_share_code_aliases a ON a.form_id=f.id WHERE f.status != 'deleted'"]));
const byForm = new Map();
for (const row of result[0]?.results || []) {
  const form = byForm.get(row.id) || { id: row.id, shareCode: row.share_code, aliases: [] };
  if (row.alias_code) form.aliases.push(row.alias_code); byForm.set(row.id, form);
}
const forms = [...byForm.values()];
const used = new Set(forms.flatMap(form => form.aliases).filter(isShort));
const statements = [];
for (const form of forms) {
  const restoredLong = isShort(form.shareCode) ? form.aliases.find(isLong) : null;
  const canonical = restoredLong || form.shareCode;
  if (restoredLong) {
    statements.push(`UPDATE forms SET share_code=${sql(restoredLong)} WHERE id=${sql(form.id)}`);
    statements.push(`DELETE FROM form_share_code_aliases WHERE code=${sql(restoredLong)}`);
  }
  const short = isShort(form.shareCode) ? form.shareCode : form.aliases.find(isShort) || nextShort(used);
  if (!form.aliases.includes(short)) statements.push(`INSERT INTO form_share_code_aliases (code,form_id,created_at) VALUES (${sql(short)},${sql(form.id)},${sql(new Date().toISOString())})`);
  if (!isLong(canonical)) throw new Error(`Form ${form.id} has no long canonical share code to preserve.`);
}
if (statements.length) await run(["d1", "execute", "forms-db", mode, ...persist, "--command", statements.join(";")]);
console.log(`Prepared ${forms.length} short form link${forms.length === 1 ? "" : "s"} in ${mode.slice(2)} D1; each redirects to its long canonical URL.`);
