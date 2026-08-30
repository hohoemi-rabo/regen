/**
 * 診断バンドルの生成(GTFS + 標高 → diagnose() → 成果物一式)。
 *
 * 要件§9.1の処理順序は packages/core が持つ。ここがやるのは
 * 「GTFSから代表経路を決め、標高を貼り、diagnose() に渡し、画面が読む形に整える」ところまで。
 *
 * 出力は data/bundle/ に置く7ファイル:
 *   map.geojson        F-1マップ用(簡略ポリライン + 判定)
 *   routes_summary.json 一覧・D1 routes の素
 *   profiles.json      F-2診断書の表示用縦断(最大400点に間引き)
 *   profiles25.json    F-3/F-4がブラウザで再計算するための25m解像度の補正後標高
 *   schedules.json     代表運行日のダイヤ(F-2-5 充電計画)
 *   agencies.json      D1 agencies の素
 *   feeds.json         D1 feeds の素(有効期限監視 = F-8-5)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  diagnose, fillNulls, haversine, resample, smooth, SMOOTH_W, STEP,
} from "@regen/core";
import { parseCsv } from "./csv";
import { elevAt, prefetchTiles } from "./dem";
import { loadFeed, type FeedRoute } from "./gtfs";
import type { FeedSource, RemoteFeed } from "./feeds";

/** グラフの横幅768pxに対して十分な解像度。55km路線でも約140m刻みになる */
const MAX_PROFILE_POINTS = 400;
/** マップのポリラインの点数上限。実診断時(Python版)と同じ値 */
const MAX_POLYLINE_POINTS = 220;

// ---------------------------------------------------------------------------
// 成果物の型
// ---------------------------------------------------------------------------

export interface SummaryRow {
  id: string; name: string; agency: string; verdict: string;
  batt: number; kwh: number; L: number; up: number; gmax: number;
  mode: "A" | "B"; trips: number; regen: number; Etr: number;
  emax: number; emin: number; corr: number; daily: number;
  charges: number; daily_pct: number;
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

export interface TripTime { dep: string; arr: string }

export interface RouteSchedule {
  /** 代表運行日のラベル(例「平日」「土曜」) */
  repDayLabel: string;
  repTrips: number;
  /** GTFSの全ダイヤ合計便数(一覧・判定が使っている値) */
  totalTrips: number;
  breakdown: { label: string; trips: number }[];
  trips: TripTime[];
}

export interface AgencyRow {
  /** feed_id + "_" + agency_id。飯田市は2フィードにまたがるので複合にする(要件§6.1) */
  id: string;
  name: string;
  feedId: string;
}

export interface FeedRow {
  id: string;
  name: string;
  sourceUrl: string;
  /** YYYY-MM-DD。GTFSは YYYYMMDD なので変換する */
  feedStart: string | null;
  feedEnd: string | null;
  /** gtfs-data.jp の公開ファイルUUID(更新検出の鍵)。オフライン実行では null */
  fileUid: string | null;
  publishedAt: string | null;
}

export interface Bundle {
  summary: SummaryRow[];
  geojson: { type: "FeatureCollection"; features: unknown[] };
  profiles: Record<string, RouteProfile>;
  profiles25: Record<string, number[]>;
  schedules: Record<string, RouteSchedule>;
  agencies: AgencyRow[];
  feeds: FeedRow[];
  /** 路線ID -> D1 routes.length_m に入れる実長 [m] */
  lengthM: Record<string, number>;
  /**
   * 路線ID -> 最急勾配(**分数**、丸めない)。
   * judge() のしきい値が 0.1 ちょうどなので、%へ丸めた値から戻すと 9.95% が 10% になり
   * 判定が変わってしまう。D1とマップにはこの精度のまま入れる
   */
  maxGrade: Record<string, number>;
  /** 路線ID -> 所属フィードID */
  feedOf: Record<string, string>;
}

// ---------------------------------------------------------------------------
// GTFSの読み出し(事業者・フィード・ダイヤ)
// ---------------------------------------------------------------------------

function rd(dir: string, file: string): Record<string, string>[] {
  const p = join(dir, file);
  return existsSync(p) ? parseCsv(readFileSync(p, "utf8")) : [];
}

/** GTFSの YYYYMMDD を YYYY-MM-DD に。空なら null */
function toDate(v: string | undefined): string | null {
  if (!v || v.length !== 8) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS = ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"];
/** 平日5日が同じ便数なら「平日」とまとめて呼ぶ */
const WEEKDAY_LABEL = "平日";

/** "06:50:00" → "06:50"。GTFSは24時超え(25:10)もありうるのでそのまま残す */
function hhmm(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t.trim();
}

function toMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

/**
 * service_id → 通常ダイヤで走る曜日(0=月〜6=日)の集合。
 *
 * 代表運行日は「通常の1日」を表したいので calendar.txt の曜日フラグだけで決める。
 * calendar_dates.txt は特定日の例外(祝日運行・年末年始運休など)であり、これを
 * 曜日に足すと「土・日・祝」ダイヤが祝日のある平日に混入して便数が二重になる。
 * calendar.txt に定義のない service_id だけ、例外日の曜日分布から補う。
 */
function serviceDays(dir: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const c of rd(dir, "calendar.txt")) {
    const days = new Set<number>();
    DAY_KEYS.forEach((k, i) => {
      if (c[k] === "1") days.add(i);
    });
    out.set(c.service_id, days);
  }
  for (const d of rd(dir, "calendar_dates.txt")) {
    if (out.has(d.service_id) || d.exception_type !== "1") continue;
    if (!/^\d{8}$/.test(d.date)) continue;
    const dow = (new Date(
      parseInt(d.date.slice(0, 4)),
      parseInt(d.date.slice(4, 6)) - 1,
      parseInt(d.date.slice(6, 8))
    ).getDay() + 6) % 7; // JSは日曜0 → 月曜0に揃える
    const days = out.get(d.service_id) ?? new Set<number>();
    days.add(dow);
    out.set(d.service_id, days);
  }
  return out;
}

/** 1フィード分の代表運行日ダイヤを路線IDごとに組み立てる */
function scheduleForFeed(dir: string, feedId: string, routes: FeedRoute[]): Record<string, RouteSchedule> {
  const days = serviceDays(dir);
  const trips = rd(dir, "trips.txt");

  const seq = new Map<string, { s: number; dep: string; arr: string }[]>();
  for (const st of rd(dir, "stop_times.txt")) {
    const arr = seq.get(st.trip_id) ?? [];
    arr.push({ s: parseInt(st.stop_sequence), dep: st.departure_time, arr: st.arrival_time });
    seq.set(st.trip_id, arr);
  }
  const times = new Map<string, TripTime>();
  for (const [tripId, arr] of seq) {
    arr.sort((a, b) => a.s - b.s);
    const dep = arr.find((x) => x.dep)?.dep ?? "";
    const last = [...arr].reverse().find((x) => x.arr)?.arr ?? dep;
    if (dep) times.set(tripId, { dep: hhmm(dep), arr: hhmm(last) });
  }

  const out: Record<string, RouteSchedule> = {};
  for (const r of routes) {
    const routeTrips = trips.filter((t) => t.route_id === r.routeId);
    if (routeTrips.length !== r.trips) {
      throw new Error(`便数が代表経路の集計と一致しません: ${feedId}_${r.routeId} trips=${routeTrips.length} route=${r.trips}`);
    }

    const perDay: string[][] = Array.from({ length: 7 }, () => []);
    for (const t of routeTrips) {
      for (const d of days.get(t.service_id) ?? []) perDay[d].push(t.trip_id);
    }
    let repDay = 0;
    for (let d = 1; d < 7; d++) if (perDay[d].length > perDay[repDay].length) repDay = d;

    const tripsOfDay = perDay[repDay]
      .map((id) => times.get(id))
      .filter((x): x is TripTime => Boolean(x))
      .sort((a, b) => toMinutes(a.dep) - toMinutes(b.dep));

    const weekdayCounts = [0, 1, 2, 3, 4].map((d) => perDay[d].length);
    const isUniformWeekday = repDay <= 4 && weekdayCounts.every((c) => c === weekdayCounts[0]);

    const breakdown = new Map<string, number>();
    for (const t of routeTrips) breakdown.set(t.service_id, (breakdown.get(t.service_id) ?? 0) + 1);

    out[`${feedId}_${r.routeId}`] = {
      repDayLabel: isUniformWeekday ? WEEKDAY_LABEL : DAY_LABELS[repDay],
      repTrips: tripsOfDay.length,
      totalTrips: routeTrips.length,
      breakdown: [...breakdown].map(([label, trips]) => ({ label, trips })),
      trips: tripsOfDay,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// プロファイルの整形
// ---------------------------------------------------------------------------

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

/** マップ用に等間隔で間引く(実診断時と同じ規則。両端は必ず残す) */
function simplify(lat: number[], lon: number[], maxPts: number): [number, number][] {
  const stride = Math.max(1, Math.floor(lat.length / maxPts));
  const out: [number, number][] = [];
  for (let i = 0; i < lat.length; i += stride) out.push([+lat[i].toFixed(5), +lon[i].toFixed(5)]);
  const last: [number, number] = [+lat[lat.length - 1].toFixed(5), +lon[lon.length - 1].toFixed(5)];
  if (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1]) out.push(last);
  return out;
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

/**
 * 展開済みの `data/gtfs/<feedId>/` から全成果物を組み立てる。
 * `remote` を渡すと feeds.json に gtfs-data.jp 側の版情報が入る(オフライン実行では null)。
 */
export async function buildBundle(
  root: string,
  sources: FeedSource[],
  remote?: RemoteFeed[]
): Promise<Bundle> {
  const gtfsDir = join(root, "data", "gtfs");
  const remoteById = new Map((remote ?? []).map((r) => [r.id, r]));

  const agencies: AgencyRow[] = [];
  const feeds: FeedRow[] = [];
  const schedules: Record<string, RouteSchedule> = {};
  const perRoute: { id: string; feedId: string; route: FeedRoute }[] = [];

  for (const s of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    const dir = join(gtfsDir, s.id);
    if (!existsSync(dir)) throw new Error(`${dir} がありません(GTFSの展開が先です)`);

    const agency = rd(dir, "agency.txt")[0];
    if (!agency) throw new Error(`${s.id}/agency.txt が読めません`);
    agencies.push({
      id: `${s.id}_${agency.agency_id || s.id}`,
      name: agency.agency_name,
      feedId: s.id,
    });

    const info = rd(dir, "feed_info.txt")[0];
    const r = remoteById.get(s.id);
    feeds.push({
      id: s.id,
      name: info?.feed_publisher_name || agency.agency_name,
      sourceUrl: info?.feed_publisher_url || agency.agency_url || "",
      feedStart: toDate(info?.feed_start_date),
      feedEnd: toDate(info?.feed_end_date),
      fileUid: r?.fileUid ?? null,
      publishedAt: r?.publishedAt ?? null,
    });

    const routes = loadFeed(dir, s.id);
    Object.assign(schedules, scheduleForFeed(dir, s.id, routes));
    for (const route of routes) perRoute.push({ id: `${s.id}_${route.routeId}`, feedId: s.id, route });
  }

  perRoute.sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(perRoute.map((r) => r.id));
  if (ids.size !== perRoute.length) throw new Error("路線IDが重複しています");

  // 標高は先に全部集める(1点ずつ取ると直列になって初回が極端に遅い)
  const resampled = perRoute.map((r) => resample(r.route.pts));
  console.log(`  路線 ${perRoute.length} 件 / サンプル ${resampled.reduce((n, r) => n + r.lat.length, 0)} 点`);
  await prefetchTiles(resampled);

  const summary: SummaryRow[] = [];
  const features: unknown[] = [];
  const profiles: Record<string, RouteProfile> = {};
  const profiles25: Record<string, number[]> = {};
  const lengthM: Record<string, number> = {};
  const maxGrade: Record<string, number> = {};
  const feedOf: Record<string, string> = {};

  for (let k = 0; k < perRoute.length; k++) {
    const { id, feedId, route } = perRoute[k];
    const rs = resampled[k];

    // 停留所アンカー: 元座標列の累積距離をサンプルindexに変換(mode Bで使用)
    const anchors: number[] = [0];
    let cum = 0;
    for (let i = 0; i < route.pts.length - 1; i++) {
      cum += haversine(route.pts[i][0], route.pts[i][1], route.pts[i + 1][0], route.pts[i + 1][1]);
      anchors.push(Math.min(Math.round(cum / STEP), rs.dist.length - 1));
    }

    const elev: (number | null)[] = [];
    for (let i = 0; i < rs.lat.length; i++) elev.push(await elevAt(rs.lat[i], rs.lon[i]));
    const d = diagnose({ elev, gap: rs.gap, mode: route.mode, anchors, trips: route.trips });

    // 一覧・マップに出す km は診断が使った長さ (n-1)*STEP から丸める。
    // D1 の length_m は生の経路長(下の lengthM)で、両者はサブメートル違う
    const km = +(d.lengthM / 1000).toFixed(1);
    summary.push({
      id, name: route.name, agency: route.agency, verdict: d.verdict,
      batt: Math.round(d.roundtripBattPct),
      kwh: +d.kwhPerKm.toFixed(2),
      L: km,
      up: Math.round(d.up),
      gmax: +(d.gmax * 100).toFixed(1),
      mode: route.mode,
      trips: route.trips,
      regen: +d.regenKwh.toFixed(1),
      Etr: +d.tractionKwh.toFixed(1),
      emax: Math.round(d.emax),
      emin: Math.round(d.emin),
      corr: d.correctedM,
      daily: +d.dailyKwh.toFixed(1),
      charges: d.extraCharges,
      daily_pct: Math.round((d.dailyKwh / 105) * 100),
    });

    features.push({
      type: "Feature",
      properties: {
        id, name: route.name, agency: route.agency, verdict: d.verdict,
        accuracy: route.mode, L: km, trips: route.trips,
        batt: Math.round(d.roundtripBattPct), charges: d.extraCharges,
        // 実測補正(F-4)をマップで当てるための値。
        // 補正後kWh = kDrive×(etr−regen) + kAux×空調、空調 = ew −(etr−regen)。
        // **判定のしきい値に効くので丸めを浅くしない**(mg は分数)
        etr: +d.tractionKwh.toFixed(4), regen: +d.regenKwh.toFixed(4),
        ew: +d.eWinterKwh.toFixed(4), mg: +d.gmax.toFixed(6),
      },
      geometry: {
        type: "LineString",
        coordinates: simplify(rs.lat, rs.lon, MAX_POLYLINE_POINTS).map(([la, lo]) => [lo, la]),
      },
    });

    // 補正量は「補正前(欠損補間+平滑化まで)」との差で測る(diagnose と同じ前処理)
    const beforeCorrection = smooth(fillNulls(elev.slice()), SMOOTH_W);
    const { elev: thinned, stepM } = thin(d.elev, MAX_PROFILE_POINTS);
    let peakIdx = 0;
    thinned.forEach((v, i) => {
      if (v > thinned[peakIdx]) peakIdx = i;
    });

    profiles[id] = {
      elev: thinned,
      stepM,
      lengthM: d.lengthM,
      dn: Math.round(d.dn),
      corrSegments: toSegments(d.correctedIdx, beforeCorrection, d.elev),
      firstStop: route.firstStop,
      lastStop: route.lastStop,
      peakIdx,
      eSummerKwh: Math.round(d.eSummerKwh * 100) / 100,
      eWinterKwh: Math.round(d.eWinterKwh * 100) / 100,
    };
    /** 丸め誤差は冬電力量で0.02%未満 */
    profiles25[id] = d.elev.map((v) => Math.round(v * 100) / 100);
    // D1 routes.length_m は生の経路長。判定に使う (n-1)*STEP とはサブメートルの差がある
    lengthM[id] = route.pathLenM;
    maxGrade[id] = d.gmax;
    feedOf[id] = feedId;
  }

  return {
    summary,
    geojson: { type: "FeatureCollection", features },
    profiles, profiles25, schedules, agencies, feeds, lengthM, maxGrade, feedOf,
  };
}

/** data/bundle/ へ書き出す。R2に上げる形とは別(こちらは差分を人が読めるようにコミットする) */
export function writeArtifacts(root: string, b: Bundle): void {
  const dir = join(root, "data", "bundle");
  mkdirSync(dir, { recursive: true });
  const w = (name: string, value: unknown, pretty = false) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, pretty ? 2 : undefined) + (pretty ? "\n" : ""));

  w("map.geojson", b.geojson);
  w("routes_summary.json", b.summary);
  w("profiles.json", b.profiles);
  w("profiles25.json", b.profiles25);
  w("schedules.json", b.schedules);
  w("agencies.json", b.agencies, true);
  w("feeds.json", b.feeds, true);
  console.log(`  data/bundle/ に7ファイルを書き出しました(路線 ${b.summary.length} / フィード ${b.feeds.length})`);
}
