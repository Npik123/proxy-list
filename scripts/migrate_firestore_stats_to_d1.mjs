#!/usr/bin/env node
/**
 * Seed preview D1 with historical link click/rating counts, preserving
 * sha256(normalized URL) hashes used by Firestore link_clicks / linkRatings.
 *
 * Sources (in order):
 *   1. scripts/_migrate_out/link_clicks.json + linkRatings.json (if present)
 *   2. Production Worker APIs + docs/data.json URL list
 *   3. Optional Firestore Admin REST when GOOGLE_ACCESS_TOKEN is set
 *
 * Usage:
 *   node scripts/migrate_firestore_stats_to_d1.mjs
 *   node scripts/migrate_firestore_stats_to_d1.mjs --dry-run
 *   node scripts/migrate_firestore_stats_to_d1.mjs --db proxy-list-stats-preview
 *   node scripts/migrate_firestore_stats_to_d1.mjs --api https://proxy-list.jasonthegamer48.workers.dev
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "_migrate_out");
const PROJECT = process.env.FIREBASE_PROJECT_ID || "proxy-list-c06ea";
const DB_NAME = argValue("--db") || "proxy-list-stats-preview";
const API_BASE = (argValue("--api") || "https://proxy-list.jasonthegamer48.workers.dev").replace(
  /\/+$/,
  ""
);
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const MAX_URL_LEN = 2048;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : "";
}

function sqlString(s) {
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

function sha256Hex(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function normalizeUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    let out = parsed.href;
    if (out.endsWith("/") && (out.match(/\//g) || []).length > 3) out = out.replace(/\/+$/, "");
    return out.slice(0, MAX_URL_LEN);
  } catch (_) {
    return "";
  }
}

function legacyNormalizeUrl(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function clickUrlVariants(raw) {
  const modern = normalizeUrl(raw);
  const legacy = legacyNormalizeUrl(raw);
  const out = [];
  if (modern) out.push(modern);
  if (legacy && legacy !== modern) out.push(legacy);
  return out;
}

function fieldInt(fields, key) {
  const f = fields && fields[key];
  if (!f) return 0;
  if (f.integerValue != null) return Number(f.integerValue) || 0;
  if (f.doubleValue != null) return Math.trunc(Number(f.doubleValue)) || 0;
  return 0;
}

function fieldStr(fields, key) {
  const f = fields && fields[key];
  return f && f.stringValue != null ? String(f.stringValue) : "";
}

function loadDumpJson(name) {
  const p = join(OUT_DIR, name);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(data) ? data : null;
  } catch (_) {
    return null;
  }
}

function collectUrlsFromDataJson() {
  const urls = new Set();
  const data = JSON.parse(readFileSync(join(ROOT, "docs", "data.json"), "utf8"));
  // format 2: links is [[locked, providerIndex, url, date], ...]
  if (Array.isArray(data.links)) {
    for (const row of data.links) {
      const link = Array.isArray(row) ? row[2] : row && (row.link || row.url);
      const n = normalizeUrl(link);
      if (n && n.length >= 10) urls.add(n);
    }
  }
  const sections = data && data.sections ? data.sections : {};
  for (const rows of Object.values(sections)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const link = Array.isArray(row) ? row[2] : row && row.link;
      const n = normalizeUrl(link);
      if (n && n.length >= 10) urls.add(n);
    }
  }
  if (Array.isArray(data.unsorted)) {
    for (const row of data.unsorted) {
      const link = Array.isArray(row) ? row[2] : row && (row.link || row.url);
      const n = normalizeUrl(link);
      if (n && n.length >= 10) urls.add(n);
    }
  }
  return [...urls];
}

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function seedFromWorkerApis() {
  const clicksByHash = new Map();
  const ratingsByHash = new Map();
  const urls = collectUrlsFromDataJson();
  console.error(`Worker API seed: ${urls.length} list URLs from data.json via ${API_BASE}`);

  try {
    const topRes = await fetch(`${API_BASE}/api/top-opens`);
    if (topRes.ok) {
      const top = await topRes.json();
      const rows = Array.isArray(top.links) ? top.links : Array.isArray(top) ? top : [];
      for (const row of rows) {
        const url = row && (row.url || row.link);
        const count = Number(row && row.count) || 0;
        const norm = normalizeUrl(url);
        if (!norm || count <= 0) continue;
        // top-opens already SUMS legacy+modern docs. Store once under the modern
        // hash; if a distinct legacy key exists, halve so the list matches prod UI.
        let storeCount = count;
        const legacy = legacyNormalizeUrl(norm);
        if (legacy && legacy !== norm) storeCount = Math.max(1, Math.round(count / 2));
        const hash = sha256Hex(norm);
        const prev = clicksByHash.get(hash);
        if (!prev || storeCount > prev.count) {
          clicksByHash.set(hash, { hash, url: norm, count: storeCount });
        }
      }
      console.error(`  top-opens: ${rows.length} rows`);
    }
  } catch (err) {
    console.error("  top-opens failed:", err.message || err);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const CLICK_BATCH = 20;
  let clickFail = 0;
  for (let i = 0; i < urls.length; i += CLICK_BATCH) {
    const batch = urls.slice(i, i + CLICK_BATCH);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const data = await fetchJson(`${API_BASE}/api/link-clicks/get`, { urls: batch });
        const counts = (data && data.counts) || {};
        for (const [norm, countRaw] of Object.entries(counts)) {
          const count = Number(countRaw) || 0;
          if (count <= 0) continue;
          for (const v of clickUrlVariants(norm)) {
            const hash = sha256Hex(v);
            const prev = clicksByHash.get(hash);
            if (!prev || count > prev.count) clicksByHash.set(hash, { hash, url: norm, count });
          }
        }
        ok = true;
      } catch (err) {
        if (attempt === 2) {
          clickFail++;
          if (clickFail <= 10) console.error(`  clicks batch ${i}:`, err.message || err);
        } else {
          await sleep(400 * (attempt + 1));
        }
      }
    }
    if (i && i % 400 === 0) await sleep(250);
    if ((i / CLICK_BATCH) % 25 === 0) {
      process.stderr.write(
        `  clicks progress ${Math.min(i + CLICK_BATCH, urls.length)}/${urls.length} (rows=${clicksByHash.size})\r`
      );
    }
  }
  process.stderr.write(`\n  clicks done; failures=${clickFail}\n`);

  const RATING_BATCH = 15;
  let ratingFail = 0;
  for (let i = 0; i < urls.length; i += RATING_BATCH) {
    const batch = urls.slice(i, i + RATING_BATCH);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const data = await fetchJson(`${API_BASE}/api/link-ratings/get`, { urls: batch });
        const ratings = (data && data.ratings) || {};
        for (const [norm, r] of Object.entries(ratings)) {
          const up = Number(r && r.up) || 0;
          const down = Number(r && r.down) || 0;
          if (up <= 0 && down <= 0) continue;
          for (const v of clickUrlVariants(norm)) {
            const hash = sha256Hex(v);
            const prev = ratingsByHash.get(hash);
            if (!prev || up > prev.up || down > prev.down) {
              ratingsByHash.set(hash, { hash, norm, up, down });
            }
          }
        }
        ok = true;
      } catch (err) {
        if (attempt === 2) {
          ratingFail++;
          if (ratingFail <= 10) console.error(`  ratings batch ${i}:`, err.message || err);
        } else {
          await sleep(400 * (attempt + 1));
        }
      }
    }
    if (i && i % 300 === 0) await sleep(250);
    if ((i / RATING_BATCH) % 40 === 0) {
      process.stderr.write(
        `  ratings progress ${Math.min(i + RATING_BATCH, urls.length)}/${urls.length} (rows=${ratingsByHash.size})\r`
      );
    }
  }
  process.stderr.write(`\n  ratings done; failures=${ratingFail}\n`);

  return {
    clicks: [...clicksByHash.values()],
    ratings: [...ratingsByHash.values()],
  };
}

async function listFirestoreCollection(collectionId, token) {
  const docs = [];
  let pageToken = "";
  for (;;) {
    const u = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionId}`
    );
    u.searchParams.set("pageSize", "300");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`list ${collectionId} failed ${res.status}: ${t.slice(0, 400)}`);
    }
    const body = await res.json();
    for (const doc of body.documents || []) {
      const hash = String(doc.name || "").split("/").pop();
      if (hash) docs.push({ hash, fields: doc.fields || {} });
    }
    pageToken = body.nextPageToken || "";
    process.stderr.write(`  ${collectionId}: ${docs.length}\r`);
    if (!pageToken) break;
  }
  process.stderr.write(`\n`);
  return docs;
}

function normalizeClicks(rows) {
  const out = [];
  for (const row of rows) {
    if (row.hash && row.count != null) {
      out.push({
        hash: row.hash,
        url: row.url || "",
        count: Number(row.count) || 0,
      });
      continue;
    }
    if (row.hash && row.fields) {
      out.push({
        hash: row.hash,
        url: fieldStr(row.fields, "url"),
        count: fieldInt(row.fields, "count"),
      });
    }
  }
  return out.filter((r) => /^[a-f0-9]{64}$/.test(r.hash) && r.count > 0);
}

function normalizeRatings(rows) {
  const out = [];
  for (const row of rows) {
    if (row.hash && (row.up != null || row.down != null)) {
      out.push({
        hash: row.hash,
        norm: row.norm || "",
        up: Number(row.up) || 0,
        down: Number(row.down) || 0,
      });
      continue;
    }
    if (row.hash && row.fields) {
      out.push({
        hash: row.hash,
        norm: fieldStr(row.fields, "norm"),
        up: fieldInt(row.fields, "up"),
        down: fieldInt(row.fields, "down"),
      });
    }
  }
  return out.filter((r) => /^[a-f0-9]{64}$/.test(r.hash) && (r.up > 0 || r.down > 0));
}

function clicksSql(docs) {
  const now = Date.now();
  const lines = [];
  for (const d of docs) {
    lines.push(
      `INSERT INTO link_clicks (hash, url, count, updated) VALUES (${sqlString(d.hash)}, ${sqlString(d.url)}, ${d.count}, ${now}) ` +
        `ON CONFLICT(hash) DO UPDATE SET url=COALESCE(NULLIF(excluded.url,''), link_clicks.url), count=MAX(link_clicks.count, excluded.count), updated=excluded.updated;`
    );
  }
  return lines.join("\n");
}

function ratingsSql(docs) {
  const now = Date.now();
  const lines = [];
  for (const d of docs) {
    lines.push(
      `INSERT INTO link_ratings (hash, norm, up, down, updated) VALUES (${sqlString(d.hash)}, ${sqlString(d.norm)}, ${d.up}, ${d.down}, ${now}) ` +
        `ON CONFLICT(hash) DO UPDATE SET norm=COALESCE(NULLIF(excluded.norm,''), link_ratings.norm), up=MAX(link_ratings.up, excluded.up), down=MAX(link_ratings.down, excluded.down), updated=excluded.updated;`
    );
  }
  return lines.join("\n");
}

function runWranglerSql(file) {
  const args = ["wrangler", "d1", "execute", DB_NAME, "--remote", "--file", file, "--yes"];
  console.error("Running:", "npx", args.join(" "));
  const r = spawnSync("npx", args, { cwd: ROOT, encoding: "utf8", shell: true, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let clicks = FORCE ? [] : normalizeClicks(loadDumpJson("link_clicks.json") || []);
  let ratings = FORCE ? [] : normalizeRatings(loadDumpJson("linkRatings.json") || []);

  if (process.env.GOOGLE_ACCESS_TOKEN) {
    console.error("Using GOOGLE_ACCESS_TOKEN Firestore export…");
    const token = process.env.GOOGLE_ACCESS_TOKEN.trim();
    clicks = normalizeClicks(await listFirestoreCollection("link_clicks", token));
    ratings = normalizeRatings(await listFirestoreCollection("linkRatings", token));
    writeFileSync(join(OUT_DIR, "link_clicks.json"), JSON.stringify(clicks));
    writeFileSync(join(OUT_DIR, "linkRatings.json"), JSON.stringify(ratings));
  } else if (!clicks.length) {
    const seeded = await seedFromWorkerApis();
    clicks = normalizeClicks(seeded.clicks);
    ratings = normalizeRatings(seeded.ratings);
    writeFileSync(join(OUT_DIR, "link_clicks.json"), JSON.stringify(clicks));
    writeFileSync(join(OUT_DIR, "linkRatings.json"), JSON.stringify(ratings));
  } else {
    console.error(`Using dump files: ${clicks.length} clicks, ${ratings.length} ratings`);
  }

  console.error(`Seed rows: ${clicks.length} clicks, ${ratings.length} ratings`);
  const clicksSqlPath = join(OUT_DIR, "seed_clicks.sql");
  const ratingsSqlPath = join(OUT_DIR, "seed_ratings.sql");
  writeFileSync(clicksSqlPath, clicksSql(clicks));
  writeFileSync(ratingsSqlPath, ratingsSql(ratings));

  if (DRY) {
    console.error("Dry run — skipping wrangler d1 execute.");
    return;
  }
  if (clicks.length) runWranglerSql(clicksSqlPath);
  if (ratings.length) runWranglerSql(ratingsSqlPath);
  console.error("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
