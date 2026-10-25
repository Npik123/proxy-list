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
function sqls(s) {
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

// Non-zero ratings visible on production Most opened (2026-10-17 screenshot).
// Full Firestore export blocked by quota — replace via migrate script when available.
const rows = [
  {
    url: "https://script.google.com/macros/s/AKfycbwqqo2qu8qT_KWNwhFRMIa-IzTs2S3vgH_7Rx14OCM8dSJU_u3TUCC7AMsrTtjo2oG-rQ/exec",
    up: 3,
    down: 0,
  },
  { url: "https://s3.amazonaws.com/angelfern/index.html", up: 2, down: 0 },
  { url: "https://account.englishbridalcouture.com/", up: 1, down: 0 },
];

const now = Date.now();
const lines = rows.map((r) => {
  const h = sha(r.url);
  return (
    `INSERT INTO link_ratings (hash,norm,up,down,updated) VALUES (${sqls(h)},${sqls(r.url)},${r.up},${r.down},${now}) ` +
    `ON CONFLICT(hash) DO UPDATE SET up=excluded.up, down=excluded.down, norm=excluded.norm, updated=excluded.updated;`
  );
});
mkdirSync(OUT, { recursive: true });
const file = join(OUT, "seed_ratings_top.sql");
writeFileSync(file, lines.join("\n"));
console.log("seeding", rows.length, "ratings");
const r = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "proxy-list-stats-preview", "--remote", "--file", file, "--yes"],
  { cwd: ROOT, stdio: "inherit", shell: true }
);
process.exit(r.status || 0);
