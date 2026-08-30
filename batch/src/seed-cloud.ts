/**
 * 診断バンドルを D1 と R2 に投入する(要件§6.1 / §6.2)。
 *
 *   pnpm --filter @regen/batch seed-cloud            # ローカル(.wrangler/state)
 *   pnpm --filter @regen/batch seed-cloud -- --remote # 本番D1/R2
 *
 * ペイロードの組み立ては共通で、書き込み先だけ切り替える。
 * 冪等: D1は ON CONFLICT DO UPDATE、R2は同一キーへの上書き。
 * R2は版ごとにキーを分けるので、**旧版のオブジェクトは消さない**(§6.2「実行中も旧版が壊れない」)。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { VEHICLES } from "@regen/core";
import type { AgencyRow, FeedRow } from "./seed-agencies";

const ROOT = join(process.cwd(), "..");
const SEED = join(ROOT, "data", "seed");
const BUNDLE = join(ROOT, "data", "bundle");
const OUT = join(process.cwd(), "out", "seed");
const WEB = join(ROOT, "apps", "web");

/** R2のキー接頭辞。apps/web/lib/site.ts の DATA_VERSION と一致させる */
const VERSION = readFileSync(join(WEB, "lib", "site.ts"), "utf8").match(
  /DATA_GENERATED_AT = "([^"]+)"/
)![1] + "-prototype";

const remote = process.argv.includes("--remote");
const target = remote ? "本番" : "ローカル";

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8"));

interface SummaryRow {
  id: string; name: string; agency: string; verdict: string;
  batt: number; kwh: number; L: number; up: number; gmax: number;
  mode: "A" | "B"; trips: number; regen: number; Etr: number;
  emax: number; emin: number; corr: number; daily: number; charges: number;
}
interface MetaRow { feed: string; route_id: string; L: number }
interface Profile {
  elev: number[]; stepM: number; lengthM: number; dn: number;
  corrSegments: { startM: number; endM: number; maxCutM: number }[];
  firstStop: string; lastStop: string; peakIdx: number;
  eSummerKwh: number; eWinterKwh: number;
}
interface Schedule {
  repDayLabel: string; repTrips: number; totalTrips: number;
  breakdown: { label: string; trips: number }[];
  trips: { dep: string; arr: string }[];
}

const summary = readJson<SummaryRow[]>(join(BUNDLE, "routes_summary.json"));
const profiles = readJson<Record<string, Profile>>(join(BUNDLE, "profiles.json"));
const profiles25 = readJson<Record<string, number[]>>(join(BUNDLE, "profiles25.json"));
const schedules = readJson<Record<string, Schedule>>(join(BUNDLE, "schedules.json"));
const geo = readJson<{ type: string; features: unknown[] }>(join(BUNDLE, "map.geojson"));
const agencies = readJson<AgencyRow[]>(join(SEED, "agencies.json"));
const feeds = readJson<FeedRow[]>(join(SEED, "feeds.json"));
const meta = readJson<MetaRow[]>(join(SEED, "routes_meta.json"));

/** 路線ID -> 所属agencyのid。routes_meta の feed から引く */
const feedOf = new Map(meta.map((m) => [`${m.feed}_${m.route_id}`, m.feed]));
/** 路線ID -> 正確なメートル値(summary の L は km 丸め) */
const metersOf = new Map(meta.map((m) => [`${m.feed}_${m.route_id}`, m.L]));
const agencyByFeed = new Map(agencies.map((a) => [a.feedId, a.id]));

const now = Date.now();
const profileKey = (id: string) => `bundles/${VERSION}/profile/${id}.json`;

// ---- R2に置くオブジェクトを組み立てる --------------------------------------
/** 1路線分をひとまとめにする。診断書も比較画面もこれ1つで足りる形にする */
const objects = new Map<string, string>();
objects.set(`bundles/${VERSION}/routes.json`, JSON.stringify(geo));
for (const r of summary) {
  const p = profiles[r.id];
  const s = schedules[r.id];
  const e25 = profiles25[r.id];
  if (!p || !s || !e25) throw new Error(`プロファイルが欠けています: ${r.id}`);
  objects.set(profileKey(r.id), JSON.stringify({
    ...p,
    elev25: e25,
    emax: r.emax, emin: r.emin, tractionKwh: r.Etr, regenKwh: r.regen,
    schedule: s,
  }));
}
objects.set(`bundles/${VERSION}/meta.json`, JSON.stringify({
  version: VERSION,
  createdAt: now,
  routeCount: summary.length,
  feedCount: feeds.length,
  source: "GTFSデータリポジトリ(gtfs-data.jp)/ 地理院タイル(国土地理院)",
}));

// ---- D1に入れる行を組み立てる ----------------------------------------------
const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null || Number.isNaN(v) ? "NULL" : String(v));

const sql: string[] = ["PRAGMA defer_foreign_keys = true;"];

for (const a of agencies) {
  sql.push(
    `INSERT INTO agencies (id, name, feed_id) VALUES (${q(a.id)}, ${q(a.name)}, ${q(a.feedId)}) ` +
    `ON CONFLICT(id) DO UPDATE SET name=excluded.name, feed_id=excluded.feed_id;`
  );
}
for (const f of feeds) {
  sql.push(
    `INSERT INTO feeds (id, name, source_url, feed_start, feed_end, fetched_at) VALUES (` +
    `${q(f.id)}, ${q(f.name)}, ${q(f.sourceUrl)}, ${q(f.feedStart)}, ${q(f.feedEnd)}, ${n(now)}) ` +
    `ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_url=excluded.source_url, ` +
    `feed_start=excluded.feed_start, feed_end=excluded.feed_end, fetched_at=excluded.fetched_at;`
  );
}
for (const r of summary) {
  const feed = feedOf.get(r.id);
  const agencyId = feed ? agencyByFeed.get(feed) : undefined;
  if (!agencyId) throw new Error(`agencyが引けません: ${r.id}`);
  const lengthM = metersOf.get(r.id) ?? r.L * 1000;
  sql.push(
    `INSERT INTO routes (id, agency_id, name, length_m, trips_per_day, climb_m, max_grade, ` +
    `kwh_per_km, roundtrip_batt_pct, daily_kwh, extra_charges, verdict, accuracy, corrected_m, ` +
    `bundle_key, updated_at) VALUES (` +
    `${q(r.id)}, ${q(agencyId)}, ${q(r.name)}, ${n(lengthM)}, ${n(r.trips)}, ${n(r.up)}, ` +
    // routes_summary の gmax は%表記。D1には分数で入れる(judge()と同じ単位に揃える)
    `${n(r.gmax / 100)}, ${n(r.kwh)}, ${n(r.batt)}, ${n(r.daily)}, ${n(r.charges)}, ` +
    `${q(r.verdict)}, ${q(r.mode)}, ${n(r.corr)}, ${q(profileKey(r.id))}, ${n(now)}) ` +
    `ON CONFLICT(id) DO UPDATE SET agency_id=excluded.agency_id, name=excluded.name, ` +
    `length_m=excluded.length_m, trips_per_day=excluded.trips_per_day, climb_m=excluded.climb_m, ` +
    `max_grade=excluded.max_grade, kwh_per_km=excluded.kwh_per_km, ` +
    `roundtrip_batt_pct=excluded.roundtrip_batt_pct, daily_kwh=excluded.daily_kwh, ` +
    `extra_charges=excluded.extra_charges, verdict=excluded.verdict, accuracy=excluded.accuracy, ` +
    `corrected_m=excluded.corrected_m, bundle_key=excluded.bundle_key, updated_at=excluded.updated_at;`
  );
}
for (const v of VEHICLES) {
  sql.push(
    `INSERT INTO vehicles (id, name, powertrain, mass_kg, battery_kwh, drive_eff, regen_eff, ` +
    `cda, crr, fuel_km_per_l, price_yen, subsidy_yen, source_url, note, is_public) VALUES (` +
    `${q(v.id)}, ${q(v.name)}, ${q(v.powertrain)}, ${n(v.massKg)}, ${n(v.batteryKwh)}, ` +
    `${n(v.driveEff)}, ${n(v.regenEff)}, ${n(v.cda)}, ${n(v.crr)}, ${n(v.fuelKmPerL)}, ` +
    `${n(v.priceYen)}, ${n(v.subsidyYen)}, ${q(v.sourceUrl)}, ${q(v.note)}, 1) ` +
    `ON CONFLICT(id) DO UPDATE SET name=excluded.name, powertrain=excluded.powertrain, ` +
    `mass_kg=excluded.mass_kg, battery_kwh=excluded.battery_kwh, drive_eff=excluded.drive_eff, ` +
    `regen_eff=excluded.regen_eff, cda=excluded.cda, crr=excluded.crr, ` +
    `fuel_km_per_l=excluded.fuel_km_per_l, price_yen=excluded.price_yen, ` +
    `subsidy_yen=excluded.subsidy_yen, source_url=excluded.source_url, note=excluded.note, ` +
    `is_public=excluded.is_public;`
  );
}
// この版を現行にする。他の版は降ろす(§6.2「切替はD1のメタ更新で行う」)
sql.push(
  `INSERT INTO bundles (version, created_at, route_count, feed_count, params_json, source_note, is_current) ` +
  `VALUES (${q(VERSION)}, ${n(now)}, ${n(summary.length)}, ${n(feeds.length)}, ` +
  `${q(JSON.stringify({ step: 25, maxGrade: 0.12, smoothW: 7 }))}, ` +
  `${q("GTFSデータリポジトリ(gtfs-data.jp)/ 地理院タイル(国土地理院)")}, 1) ` +
  `ON CONFLICT(version) DO UPDATE SET created_at=excluded.created_at, ` +
  `route_count=excluded.route_count, feed_count=excluded.feed_count, ` +
  `params_json=excluded.params_json, source_note=excluded.source_note, is_current=1;`
);
sql.push(`UPDATE bundles SET is_current = 0 WHERE version <> ${q(VERSION)};`);

// ---- 書き込み ---------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const sqlPath = join(OUT, "seed.sql");
writeFileSync(sqlPath, sql.join("\n") + "\n");

const wrangler = (args: string[]) =>
  execFileSync("pnpm", ["--filter", "web", "exec", "wrangler", ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();

console.log(`==> ${target}D1へ ${sql.length - 1} 文を適用`);
wrangler(["d1", "execute", "regen-db", remote ? "--remote" : "--local", "--file", sqlPath, "-y"]);

console.log(`==> ${target}R2へ ${objects.size} オブジェクトを書き込み(版 ${VERSION})`);
let i = 0;
for (const [key, body] of objects) {
  const tmp = join(OUT, "obj.json");
  writeFileSync(tmp, body);
  wrangler([
    "r2", "object", "put", `regen-bundles/${key}`,
    "--file", tmp, "--content-type", "application/json",
    remote ? "--remote" : "--local",
  ]);
  if (++i % 10 === 0 || i === objects.size) console.log(`    ${i}/${objects.size}`);
}

console.log(`done: routes ${summary.length} / agencies ${agencies.length} / feeds ${feeds.length} / vehicles ${VEHICLES.length}`);
