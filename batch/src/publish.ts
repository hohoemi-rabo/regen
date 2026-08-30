/**
 * 診断バンドルの公開(要件§6.1 / §6.2、F-8-3)。
 *
 * **順序が受入条件そのもの**:「実行中も旧版が壊れない」。
 *   1. R2に新版のオブジェクトを全部書く(meta.json を最後に書いて完了印にする)
 *   2. D1の行を更新する(新版は is_current=0 のまま入れる)
 *   3. 最後に is_current を新版へ付け替える
 * どこで失敗しても、配信中の版は必ず「R2に全部揃っている版」を指している。
 *
 * R2は版ごとにキーを分けるので**旧版のオブジェクトは消さない**。
 * F-6の共有ページが `bundleVersion` を固定して読むため、消すと過去の共有URLの数字が動く。
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VEHICLES } from "@regen/core";
import { d1ExecFile, d1Query, q, n, r2Put, type CfTarget } from "./cf";
import type { Bundle } from "./pipeline";
import { paramsSnapshot } from "./snapshot";

const SOURCE_NOTE = "GTFSデータリポジトリ(gtfs-data.jp)/ 地理院タイル(国土地理院)";
/**
 * R2アップロードは直列で行う。
 * wrangler を並列に起動すると、ローカル(miniflare)では各プロセスが同じSQLiteを掴んで
 * `SQLITE_BUSY` で落ちる(next build を cpus:1 に固定しているのと同じ理由 — CLAUDE.md)。
 * 48オブジェクトで1分弱、15分の予算に対して問題にならないので、速さより確実さを取る。
 */
const UPLOAD_CONCURRENCY = 1;

const workDir = (t: CfTarget) => join(t.root, "batch", "out", "publish");

export const profileKey = (version: string, id: string) => `bundles/${version}/profile/${id}.json`;

/** R2に置くオブジェクト。routes.json と 1路線1オブジェクト、最後に meta.json */
function buildObjects(b: Bundle, version: string, createdAt: number): Map<string, string> {
  const objects = new Map<string, string>();
  objects.set(`bundles/${version}/routes.json`, JSON.stringify(b.geojson));

  for (const r of b.summary) {
    const p = b.profiles[r.id];
    const s = b.schedules[r.id];
    const e25 = b.profiles25[r.id];
    if (!p || !s || !e25) throw new Error(`プロファイルが欠けています: ${r.id}`);
    // 診断書と比較画面が1リクエストで足りるよう1路線1オブジェクトにまとめる
    objects.set(profileKey(version, r.id), JSON.stringify({
      ...p,
      elev25: e25,
      emax: r.emax, emin: r.emin, tractionKwh: r.Etr, regenKwh: r.regen,
      schedule: s,
    }));
  }

  objects.set(`bundles/${version}/meta.json`, JSON.stringify({
    version,
    createdAt,
    routeCount: b.summary.length,
    feedCount: b.feeds.length,
    params: paramsSnapshot(),
    source: SOURCE_NOTE,
  }));
  return objects;
}

async function uploadAll(t: CfTarget, objects: Map<string, string>, version: string): Promise<number> {
  const dir = workDir(t);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // meta.json は完了印なので必ず最後に置く
  const metaKey = `bundles/${version}/meta.json`;
  const entries = [...objects].filter(([k]) => k !== metaKey);

  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, entries.length) }, async (_, worker) => {
      const tmp = join(dir, `obj-${worker}.json`);
      while (next < entries.length) {
        const [key, body] = entries[next++];
        writeFileSync(tmp, body);
        await r2Put(t, key, tmp);
        if (++done % 10 === 0 || done === entries.length) console.log(`    ${done}/${objects.size}`);
      }
    })
  );

  const tmp = join(dir, "meta.json");
  writeFileSync(tmp, objects.get(metaKey)!);
  await r2Put(t, metaKey, tmp);
  console.log(`    ${objects.size}/${objects.size}`);
  rmSync(dir, { recursive: true, force: true });
  return objects.size;
}

/** D1の行(版切替は含めない)。すべて ON CONFLICT DO UPDATE で冪等 */
function buildSql(b: Bundle, version: string, createdAt: number): string[] {
  const sql: string[] = ["PRAGMA defer_foreign_keys = true;"];
  const agencyByFeed = new Map(b.agencies.map((a) => [a.feedId, a.id]));

  for (const a of b.agencies) {
    sql.push(
      `INSERT INTO agencies (id, name, feed_id) VALUES (${q(a.id)}, ${q(a.name)}, ${q(a.feedId)}) ` +
      `ON CONFLICT(id) DO UPDATE SET name=excluded.name, feed_id=excluded.feed_id;`
    );
  }
  for (const f of b.feeds) {
    sql.push(
      `INSERT INTO feeds (id, name, source_url, feed_start, feed_end, file_uid, published_at, fetched_at) VALUES (` +
      `${q(f.id)}, ${q(f.name)}, ${q(f.sourceUrl)}, ${q(f.feedStart)}, ${q(f.feedEnd)}, ` +
      `${q(f.fileUid)}, ${q(f.publishedAt)}, ${n(createdAt)}) ` +
      `ON CONFLICT(id) DO UPDATE SET name=excluded.name, source_url=excluded.source_url, ` +
      `feed_start=excluded.feed_start, feed_end=excluded.feed_end, file_uid=excluded.file_uid, ` +
      `published_at=excluded.published_at, fetched_at=excluded.fetched_at;`
    );
  }
  for (const r of b.summary) {
    const agencyId = agencyByFeed.get(b.feedOf[r.id]);
    if (!agencyId) throw new Error(`agencyが引けません: ${r.id}`);
    sql.push(
      `INSERT INTO routes (id, agency_id, name, length_m, trips_per_day, climb_m, max_grade, ` +
      `kwh_per_km, traction_kwh, regen_kwh, roundtrip_batt_pct, daily_kwh, extra_charges, ` +
      `verdict, accuracy, corrected_m, bundle_key, updated_at) VALUES (` +
      `${q(r.id)}, ${q(agencyId)}, ${q(r.name)}, ${n(b.lengthM[r.id])}, ${n(r.trips)}, ${n(r.up)}, ` +
      // 判定は max_grade < 0.1 で決まるので、%へ丸めた値から戻さず分数のまま入れる
      // (9.95% を 10% に丸めると判定が変わる)
      `${n(b.maxGrade[r.id])}, ${n(r.kwh)}, ${n(r.Etr)}, ${n(r.regen)}, ` +
      `${n(r.batt)}, ${n(r.daily)}, ${n(r.charges)}, ` +
      `${q(r.verdict)}, ${q(r.mode)}, ${n(r.corr)}, ${q(profileKey(version, r.id))}, ${n(createdAt)}) ` +
      `ON CONFLICT(id) DO UPDATE SET agency_id=excluded.agency_id, name=excluded.name, ` +
      `length_m=excluded.length_m, trips_per_day=excluded.trips_per_day, climb_m=excluded.climb_m, ` +
      `max_grade=excluded.max_grade, kwh_per_km=excluded.kwh_per_km, ` +
      `traction_kwh=excluded.traction_kwh, regen_kwh=excluded.regen_kwh, ` +
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
  // 新版はまだ配信しない。切替は全部書き終えてから(switchCurrent)
  sql.push(
    `INSERT INTO bundles (version, created_at, route_count, feed_count, params_json, source_note, is_current) ` +
    `VALUES (${q(version)}, ${n(createdAt)}, ${n(b.summary.length)}, ${n(b.feeds.length)}, ` +
    `${q(JSON.stringify(paramsSnapshot()))}, ${q(SOURCE_NOTE)}, 0) ` +
    `ON CONFLICT(version) DO UPDATE SET created_at=excluded.created_at, ` +
    `route_count=excluded.route_count, feed_count=excluded.feed_count, ` +
    `params_json=excluded.params_json, source_note=excluded.source_note;`
  );
  return sql;
}

function applySql(t: CfTarget, sql: string[], name: string): void {
  const dir = workDir(t);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, sql.join("\n") + "\n");
  d1ExecFile(t, p);
}

/** 現在配信中の版(無ければ null) */
export function currentVersion(t: CfTarget): string | null {
  const rows = d1Query<{ version: string }>(t, "SELECT version FROM bundles WHERE is_current = 1 LIMIT 1");
  return rows[0]?.version ?? null;
}

/** バッチ実行の開始を記録し、batch_runs.id を返す */
export function startRun(t: CfTarget, startedAt: number): number {
  const rows = d1Query<{ id: number }>(
    t,
    `INSERT INTO batch_runs (started_at, status) VALUES (${n(startedAt)}, 'running') RETURNING id;`
  );
  return rows[0]?.id ?? 0;
}

export function finishRun(
  t: CfTarget,
  id: number,
  status: "success" | "failed",
  info: { feeds?: number; routes?: number; version?: string | null; message?: string }
): void {
  if (!id) return;
  const msg = (info.message ?? "").slice(0, 2000);
  applySql(t, [
    `UPDATE batch_runs SET finished_at=${n(Date.now())}, status=${q(status)}, ` +
    `feeds=${n(info.feeds ?? null)}, routes=${n(info.routes ?? null)}, ` +
    `version=${q(info.version ?? null)}, message=${q(msg)} WHERE id=${n(id)};`,
  ], "run.sql");
}

/** フィードの取得時刻だけ更新する(更新が無く再計算をしなかったとき) */
export function touchFeeds(t: CfTarget, feedIds: string[], at: number): void {
  if (!feedIds.length) return;
  const list = feedIds.map((f) => q(f)).join(", ");
  applySql(t, [`UPDATE feeds SET fetched_at=${n(at)} WHERE id IN (${list});`], "touch.sql");
}

export interface PublishResult {
  version: string;
  objects: number;
  statements: number;
}

/** R2 → D1 → 版切替。ここを通ったら新版が配信されている */
export async function publish(t: CfTarget, b: Bundle, version: string, createdAt: number): Promise<PublishResult> {
  const objects = buildObjects(b, version, createdAt);
  console.log(`==> ${t.remote ? "本番" : "ローカル"}R2へ ${objects.size} オブジェクト(版 ${version})`);
  await uploadAll(t, objects, version);

  const sql = buildSql(b, version, createdAt);
  console.log(`==> ${t.remote ? "本番" : "ローカル"}D1へ ${sql.length - 1} 文`);
  applySql(t, sql, "seed.sql");

  // ここまで来て初めて切り替える(§6.2「切替はD1のメタ更新で行う」)
  console.log(`==> 版を ${version} に切り替え`);
  applySql(t, [
    `UPDATE bundles SET is_current = 0 WHERE version <> ${q(version)};`,
    `UPDATE bundles SET is_current = 1 WHERE version = ${q(version)};`,
  ], "switch.sql");

  return { version, objects: objects.size, statements: sql.length - 1 };
}
