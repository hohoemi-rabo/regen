/**
 * F-2 診断書の表示用プロファイル生成。
 * data/seed/dem_all_routes.json(生標高)+ routes_meta.json を packages/core に通し、
 * 補正・平滑化後の縦断線と補正区間を apps/web/data/profiles.json に書き出す。
 *
 * seed の生標高をそのまま描くと、DEMがトンネル上の地表を拾った山が残る。
 * 表示に使うのは diagnose() が返す補正後プロファイル(要件§9.1と同じ処理順序)。
 *
 * 出力は2つ。
 *   profiles.json   … F-2診断書の表示用(最大400点に間引く。stepMは路線ごとに変わる)
 *   profiles25.json … F-3車両比較がブラウザで再計算するための25m解像度の補正後標高。
 *                     間引いた配列で energyForProfile() を回すと冬電力量が最大1.55%ずれ、
 *                     診断書と食い違うため、比較画面には必ずこちらを渡すこと。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diagnose, fillNulls, smooth, SMOOTH_W, STEP } from "@regen/core";

const ROOT = join(process.cwd(), "..");
const SEED = join(ROOT, "data", "seed");
const SUMMARY = join(ROOT, "data", "bundle", "routes_summary.json");
const OUT = join(ROOT, "data", "bundle", "profiles.json");
const OUT25 = join(ROOT, "data", "bundle", "profiles25.json");

/** グラフの横幅768pxに対して十分な解像度。55km路線でも約140m刻みになる */
const MAX_POINTS = 400;

interface MetaRow {
  feed: string;
  route_id: string;
  name: string;
  mode: "A" | "B";
  trips: number;
  nstops: number;
  first: string;
  last: string;
  gap: number[];
  anchors: number[];
  n: number;
}

export interface CorrSegment {
  /** 起点からの距離 [m] */
  startM: number;
  endM: number;
  /** その区間で最も大きく削った量 [m] */
  maxCutM: number;
}

export interface RouteProfile {
  /** 間引き後の標高列 [m](小数1桁) */
  elev: number[];
  /** elev[i] に対応する起点からの距離 [m] */
  stepM: number;
  /** 路線長 [m](間引き前の正確な値) */
  lengthM: number;
  /** 累積下り [m](片道) */
  dn: number;
  corrSegments: CorrSegment[];
  firstStop: string;
  lastStop: string;
  /** 最高地点の elev 上のindex */
  peakIdx: number;
  /** 片道電力量 [kWh] 夏 / 冬 */
  eSummerKwh: number;
  eWinterKwh: number;
}

const meta: MetaRow[] = JSON.parse(readFileSync(join(SEED, "routes_meta.json"), "utf8"));
const dem: (number | null)[][] = JSON.parse(readFileSync(join(SEED, "dem_all_routes.json"), "utf8"));
const summary: { id: string; up: number; gmax: number; corr: number }[] = JSON.parse(
  readFileSync(SUMMARY, "utf8")
);
const summaryById = new Map(summary.map((r) => [r.id, r]));

if (meta.length !== dem.length) {
  throw new Error(`routes_meta(${meta.length})と dem_all_routes(${dem.length})の件数が一致しません`);
}

/** 連続する補正indexを区間にまとめる */
function toSegments(correctedIdx: number[], raw: number[], corrected: number[]): CorrSegment[] {
  if (correctedIdx.length === 0) return [];
  const sorted = [...correctedIdx].sort((a, b) => a - b);
  const segs: CorrSegment[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const push = (s: number, e: number) => {
    let maxCut = 0;
    for (let i = s; i <= e; i++) maxCut = Math.max(maxCut, raw[i] - corrected[i]);
    segs.push({ startM: s * STEP, endM: e * STEP, maxCutM: Math.round(maxCut * 10) / 10 });
  };
  for (const i of sorted.slice(1)) {
    if (i !== prev + 1) {
      push(start, prev);
      start = i;
    }
    prev = i;
  }
  push(start, prev);
  return segs;
}

/** 表示用に等間隔で間引く(両端は必ず残す) */
function thin(elev: number[], maxPoints: number): { elev: number[]; stepM: number } {
  if (elev.length <= maxPoints) {
    return { elev: elev.map((v) => Math.round(v * 10) / 10), stepM: STEP };
  }
  const stride = Math.ceil(elev.length / maxPoints);
  const out: number[] = [];
  for (let i = 0; i < elev.length; i += stride) out.push(Math.round(elev[i] * 10) / 10);
  const lastIdx = elev.length - 1;
  if ((out.length - 1) * stride !== lastIdx) out.push(Math.round(elev[lastIdx] * 10) / 10);
  return { elev: out, stepM: STEP * stride };
}

const out: Record<string, RouteProfile> = {};
/** 路線ID -> 25m間隔の補正後標高(小数2桁)。丸め誤差は冬電力量で0.02%未満 */
const out25: Record<string, number[]> = {};
let mismatches = 0;

meta.forEach((m, i) => {
  const id = `${m.feed}_${m.route_id}`;
  const d = diagnose({ elev: dem[i], gap: m.gap, mode: m.mode, anchors: m.anchors, trips: m.trips });

  // seedから再現した値が、一覧に出しているサマリーと一致することを確認する
  const s = summaryById.get(id);
  if (!s) throw new Error(`routes_summaryに見つかりません: ${id}`);
  const upOk = Math.abs(Math.round(d.up) - s.up) <= 1;
  const corrOk = d.correctedM === s.corr;
  if (!upOk || !corrOk) {
    mismatches++;
    console.error(
      `不一致 ${id}: up ${Math.round(d.up)} vs ${s.up} / corr ${d.correctedM} vs ${s.corr}`
    );
  }

  // 補正量は「補正前(欠損補間+平滑化まで)」との差で測る(diagnose と同じ前処理)
  const beforeCorrection = smooth(fillNulls(dem[i].slice()), SMOOTH_W);
  const corrSegments = toSegments(d.correctedIdx, beforeCorrection, d.elev);

  out25[id] = d.elev.map((v) => Math.round(v * 100) / 100);

  const { elev, stepM } = thin(d.elev, MAX_POINTS);
  let peakIdx = 0;
  elev.forEach((v, k) => {
    if (v > elev[peakIdx]) peakIdx = k;
  });

  out[id] = {
    elev,
    stepM,
    lengthM: d.lengthM,
    dn: Math.round(d.dn),
    corrSegments,
    firstStop: m.first,
    lastStop: m.last,
    peakIdx,
    eSummerKwh: Math.round(d.eSummerKwh * 100) / 100,
    eWinterKwh: Math.round(d.eWinterKwh * 100) / 100,
  };
});

if (mismatches > 0) {
  throw new Error(`${mismatches}件でサマリーと一致しませんでした。seedかcoreの変更を確認してください`);
}

writeFileSync(OUT, JSON.stringify(out));
writeFileSync(OUT25, JSON.stringify(out25));
const segs = Object.values(out).reduce((n, p) => n + p.corrSegments.length, 0);
const samples = Object.values(out25).reduce((n, e) => n + e.length, 0);
console.log(`done: ${Object.keys(out).length} routes -> ${OUT}`);
console.log(`  25mプロファイル: ${samples}点 -> ${OUT25}`);
console.log(`  補正区間: ${segs}区間 / 補正のある路線 ${Object.values(out).filter((p) => p.corrSegments.length > 0).length}件`);
