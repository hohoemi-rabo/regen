/**
 * 代表運行日のダイヤ抽出(F-2-5 充電計画の時間帯用)。
 * 前提: data/gtfs/<フィード名>/ にGTFSが展開済みであること(README参照)。
 * 出力: apps/web/data/schedules.json
 *
 * GTFSの trips.txt はダイヤ種別(平日/土日祝など)ごとに便を持つ。既存の診断値が使う
 * trips は全種別の合計なので、実運用の時間帯を示すには曜日で数え直す必要がある。
 * ここでは calendar / calendar_dates から「最も便数の多い曜日」を代表運行日とする。
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";

const ROOT = join(process.cwd(), "..");
const GTFS_DIR = join(ROOT, "data", "gtfs");
const SUMMARY = join(ROOT, "apps", "web", "data", "routes_summary.json");
const OUT = join(ROOT, "apps", "web", "data", "schedules.json");

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS = ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"];
/** 平日5日が同じ便数なら「平日」とまとめて呼ぶ */
const WEEKDAY_LABEL = "平日";

export interface TripTime {
  dep: string;
  arr: string;
}

export interface RouteSchedule {
  /** 代表運行日のラベル(例「平日」「土曜」) */
  repDayLabel: string;
  /** 代表運行日の便数 */
  repTrips: number;
  /** GTFSの全ダイヤ合計便数(既存の診断値が使っている値) */
  totalTrips: number;
  /** ダイヤ種別ごとの内訳 */
  breakdown: { label: string; trips: number }[];
  /** 代表運行日の便(始発・終着時刻、運行順) */
  trips: TripTime[];
}

function rd(dir: string, file: string): Record<string, string>[] {
  const p = join(dir, file);
  if (!existsSync(p)) return [];
  return parseCsv(readFileSync(p, "utf-8"));
}

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

function main() {
  if (!existsSync(GTFS_DIR)) {
    console.error("data/gtfs/ にGTFSフィードが見つかりません。README の展開手順を先に実行してください。");
    process.exit(1);
  }
  const feeds = readdirSync(GTFS_DIR).filter((d) => statSync(join(GTFS_DIR, d)).isDirectory());
  const summary: { id: string; name: string; trips: number }[] = JSON.parse(readFileSync(SUMMARY, "utf8"));

  // フィードごとに1回だけGTFSを読む
  const byFeed = new Map<string, { days: Map<string, Set<number>>; trips: Record<string, string>[]; times: Map<string, TripTime> }>();
  for (const feed of feeds) {
    const dir = join(GTFS_DIR, feed);
    const times = new Map<string, TripTime>();
    const seq = new Map<string, { s: number; dep: string; arr: string }[]>();
    for (const st of rd(dir, "stop_times.txt")) {
      const arr = seq.get(st.trip_id) ?? [];
      arr.push({ s: parseInt(st.stop_sequence), dep: st.departure_time, arr: st.arrival_time });
      seq.set(st.trip_id, arr);
    }
    for (const [tripId, arr] of seq) {
      arr.sort((a, b) => a.s - b.s);
      const dep = arr.find((x) => x.dep)?.dep ?? "";
      const last = [...arr].reverse().find((x) => x.arr)?.arr ?? dep;
      if (dep) times.set(tripId, { dep: hhmm(dep), arr: hhmm(last) });
    }
    byFeed.set(feed, { days: serviceDays(dir), trips: rd(dir, "trips.txt"), times });
  }

  const out: Record<string, RouteSchedule> = {};
  for (const r of summary) {
    const idx = r.id.lastIndexOf("_");
    const feed = r.id.slice(0, idx);
    const routeId = r.id.slice(idx + 1);
    const f = byFeed.get(feed);
    if (!f) throw new Error(`フィードが見つかりません: ${feed}(${r.id})`);

    const routeTrips = f.trips.filter((t) => t.route_id === routeId);
    if (routeTrips.length !== r.trips) {
      throw new Error(`便数がroutes_summaryと一致しません: ${r.id} GTFS=${routeTrips.length} summary=${r.trips}`);
    }

    // 曜日ごとの便数を数え、最多の曜日を代表運行日にする
    const perDay: string[][] = Array.from({ length: 7 }, () => []);
    for (const t of routeTrips) {
      for (const d of f.days.get(t.service_id) ?? []) perDay[d].push(t.trip_id);
    }
    let repDay = 0;
    for (let d = 1; d < 7; d++) if (perDay[d].length > perDay[repDay].length) repDay = d;

    const repTripIds = perDay[repDay];
    const tripsOfDay = repTripIds
      .map((id) => f.times.get(id))
      .filter((x): x is TripTime => Boolean(x))
      .sort((a, b) => toMinutes(a.dep) - toMinutes(b.dep));

    // 平日5日すべて同じ便数なら「平日」と呼ぶ
    const weekdayCounts = [0, 1, 2, 3, 4].map((d) => perDay[d].length);
    const isUniformWeekday = repDay <= 4 && weekdayCounts.every((c) => c === weekdayCounts[0]);

    const breakdown = new Map<string, number>();
    for (const t of routeTrips) breakdown.set(t.service_id, (breakdown.get(t.service_id) ?? 0) + 1);

    out[r.id] = {
      repDayLabel: isUniformWeekday ? WEEKDAY_LABEL : DAY_LABELS[repDay],
      repTrips: tripsOfDay.length,
      totalTrips: routeTrips.length,
      breakdown: [...breakdown].map(([label, trips]) => ({ label, trips })),
      trips: tripsOfDay,
    };
  }

  writeFileSync(OUT, JSON.stringify(out));
  const multi = Object.values(out).filter((s) => s.repTrips !== s.totalTrips).length;
  console.log(`done: ${Object.keys(out).length} routes -> ${OUT}`);
  console.log(`  代表運行日と全ダイヤ合計が異なる路線: ${multi}件`);
}

main();
