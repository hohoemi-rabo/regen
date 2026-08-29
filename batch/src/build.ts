/**
 * 診断バンドル生成バッチ。
 * 前提: data/gtfs/<フィード名>/ にGTFSが展開済みであること(README参照)。
 * 出力: out/bundles/routes.json(一覧サマリー) と out/bundles/profile/<id>.json
 */
import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resample, diagnose, haversine, STEP } from "@regen/core";
import { loadFeed } from "./gtfs";
import { elevAt } from "./dem";

const GTFS_DIR = join(process.cwd(), "..", "data", "gtfs");
const OUT = join(process.cwd(), "out", "bundles");

function simplify(lat: number[], lon: number[], maxPts: number): [number, number][] {
  const stride = Math.max(1, Math.floor(lat.length / maxPts));
  const out: [number, number][] = [];
  for (let i = 0; i < lat.length; i += stride) out.push([+lat[i].toFixed(5), +lon[i].toFixed(5)]);
  const last: [number, number] = [+lat[lat.length - 1].toFixed(5), +lon[lon.length - 1].toFixed(5)];
  if (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1]) out.push(last);
  return out;
}

async function main() {
  const feeds = readdirSync(GTFS_DIR).filter((d) => statSync(join(GTFS_DIR, d)).isDirectory());
  if (feeds.length === 0) {
    console.error("data/gtfs/ にGTFSフィードが見つかりません。README の展開手順を先に実行してください。");
    process.exit(1);
  }
  mkdirSync(join(OUT, "profile"), { recursive: true });
  const summary: unknown[] = [];
  for (const feed of feeds) {
    const routes = loadFeed(join(GTFS_DIR, feed), feed);
    console.log(feed + ": " + routes.length + " routes");
    let n = 0;
    for (const r of routes) {
      const rs = resample(r.pts);
      // 停留所アンカー: 元座標列の累積距離をサンプルindexに変換(mode Bで使用)
      const anchors: number[] = [];
      let cum = 0;
      anchors.push(0);
      for (let i = 0; i < r.pts.length - 1; i++) {
        cum += haversine(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
        anchors.push(Math.min(Math.round(cum / STEP), rs.dist.length - 1));
      }
      const elev: (number | null)[] = [];
      for (let i = 0; i < rs.lat.length; i++) elev.push(await elevAt(rs.lat[i], rs.lon[i]));
      const d = diagnose({ elev, gap: rs.gap, mode: r.mode, anchors, trips: r.trips });
      const id = feed + "_" + r.routeId + "_" + n++;
      writeFileSync(
        join(OUT, "profile", id + ".json"),
        JSON.stringify({ id, name: r.name, dist: rs.dist, elev: d.elev.map((x) => Math.round(x * 10) / 10) })
      );
      summary.push({
        id, feed, name: r.name, agency: r.agency, accuracy: r.mode, trips: r.trips,
        lengthM: Math.round(d.lengthM), climbM: Math.round(d.up), maxGrade: +(d.gmax * 100).toFixed(1),
        kwhPerKm: +d.kwhPerKm.toFixed(2), roundtripBattPct: Math.round(d.roundtripBattPct),
        dailyKwh: +d.dailyKwh.toFixed(1), extraCharges: d.extraCharges,
        correctedM: d.correctedM, verdict: d.verdict,
        pts: simplify(rs.lat, rs.lon, 220),
      });
    }
  }
  writeFileSync(join(OUT, "routes.json"), JSON.stringify(summary));
  console.log("done: " + summary.length + " routes -> " + OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
