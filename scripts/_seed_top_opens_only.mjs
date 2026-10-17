import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "scripts", "_migrate_out");

function sha(t) {
  return createHash("sha256").update(t, "utf8").digest("hex");
}
function norm(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const p = new URL(u);
    let o = p.href;
    if (o.endsWith("/") && (o.match(/\//g) || []).length > 3) o = o.replace(/\/+$/, "");
    return o.slice(0, 2048);
  } catch {
    return "";
  }
}
function sqls(s) {
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

const res = await fetch("https://proxy-list.jasonthegamer48.workers.dev/api/top-opens");
const top = await res.json();
const rows = Array.isArray(top.links) ? top.links : [];
const now = Date.now();
function legacyNorm(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

const lines = ["DELETE FROM link_clicks;"];
for (const row of rows) {
  const n = norm(row.url);
  let c = Number(row.count) || 0;
  if (!n || c <= 0) continue;
  // /api/top-opens already SUMS legacy+modern hash docs. Storing that sum under
  // the modern hash alone doubles what the list UI shows (prod list ≈ one doc).
  // When modern !== legacy, keep a single modern row at ~half the merged total.
  const leg = legacyNorm(n);
  if (leg && leg !== n) c = Math.max(1, Math.round(c / 2));
  const h = sha(n);
  lines.push(
    `INSERT INTO link_clicks (hash,url,count,updated) VALUES (${sqls(h)},${sqls(n)},${c},${now}) ` +
      `ON CONFLICT(hash) DO UPDATE SET url=excluded.url, count=excluded.count, updated=excluded.updated;`
  );
}
mkdirSync(OUT, { recursive: true });
const file = join(OUT, "seed_top.sql");
writeFileSync(file, lines.join("\n"));
console.log("wrote", lines.length - 1, "click rows");
const r = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "proxy-list-stats-preview", "--remote", "--file", file, "--yes"],
  { cwd: ROOT, stdio: "inherit", shell: true }
);
process.exit(r.status || 0);
