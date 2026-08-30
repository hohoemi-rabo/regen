import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";
import { haversine } from "@regen/core";

export interface FeedRoute {
  feed: string;
  routeId: string;
  name: string;
  agency: string;
  mode: "A" | "B";
  trips: number;
  /** 代表tripの経路座標列 [lat, lon][] */
  pts: [number, number][];
  /** 代表tripの停留所数 */
  nstops: number;
  /** 代表経路の実長 [m](リサンプル前の生の座標列の長さ) */
  pathLenM: number;
  /** 代表tripの始発・終着停留所名(診断書の見出しに出す) */
  firstStop: string;
  lastStop: string;
}

function rd(dir: string, file: string): Record<string, string>[] {
  const p = join(dir, file);
  if (!existsSync(p)) return [];
  return parseCsv(readFileSync(p, "utf-8"));
}

function pathLen(pts: [number, number][]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += haversine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  return L;
}

/** 展開済みGTFSフィード1つから、路線ごとの代表経路を抽出する(要件定義書 §9 / 実診断と同じ選定規則) */
export function loadFeed(dir: string, feedName: string): FeedRoute[] {
  const agency = rd(dir, "agency.txt")[0]?.agency_name ?? "?";
  const routes = new Map(rd(dir, "routes.txt").map((r) => [r.route_id, r]));
  const trips = rd(dir, "trips.txt");
  const stopRows = rd(dir, "stops.txt");
  const stops = new Map(stopRows.map((s) => [s.stop_id, [parseFloat(s.stop_lat), parseFloat(s.stop_lon)] as [number, number]]));
  const stopNames = new Map(stopRows.map((s) => [s.stop_id, s.stop_name ?? ""]));

  const shapes = new Map<string, [number, [number, number]][]>();
  for (const r of rd(dir, "shapes.txt")) {
    const arr = shapes.get(r.shape_id) ?? [];
    arr.push([parseInt(r.shape_pt_sequence), [parseFloat(r.shape_pt_lat), parseFloat(r.shape_pt_lon)]]);
    shapes.set(r.shape_id, arr);
  }
  for (const arr of shapes.values()) arr.sort((a, b) => a[0] - b[0]);

  const stopTimes = new Map<string, [number, string][]>();
  for (const r of rd(dir, "stop_times.txt")) {
    const arr = stopTimes.get(r.trip_id) ?? [];
    arr.push([parseInt(r.stop_sequence), r.stop_id]);
    stopTimes.set(r.trip_id, arr);
  }
  for (const arr of stopTimes.values()) arr.sort((a, b) => a[0] - b[0]);

  const byRoute = new Map<string, Record<string, string>[]>();
  for (const t of trips) {
    const arr = byRoute.get(t.route_id) ?? [];
    arr.push(t);
    byRoute.set(t.route_id, arr);
  }

  const out: FeedRoute[] = [];
  for (const [rid, ts] of byRoute) {
    const r = routes.get(rid) ?? {};
    const name = (r.route_long_name || r.route_short_name || rid).trim();
    const withShape = ts.filter((t) => t.shape_id && shapes.has(t.shape_id));
    let pts: [number, number][];
    let mode: "A" | "B";
    let repTripId: string;
    if (withShape.length) {
      mode = "A";
      let best = withShape[0];
      let bestLen = -1;
      for (const t of withShape) {
        const p = shapes.get(t.shape_id)!.map((x) => x[1]);
        const L = pathLen(p);
        if (L > bestLen) { bestLen = L; best = t; }
      }
      pts = shapes.get(best.shape_id)!.map((x) => x[1]);
      repTripId = best.trip_id;
    } else {
      mode = "B";
      let best = ts[0];
      let bestLen = -1;
      for (const t of ts) {
        const seq = stopTimes.get(t.trip_id) ?? [];
        const p = seq.map(([, sid]) => stops.get(sid)).filter(Boolean) as [number, number][];
        const L = pathLen(p);
        if (L > bestLen) { bestLen = L; best = t; }
      }
      const seq = stopTimes.get(best.trip_id) ?? [];
      pts = seq.map(([, sid]) => stops.get(sid)).filter(Boolean) as [number, number][];
      repTripId = best.trip_id;
    }
    if (pts.length < 2) continue;

    // 起終点と停留所数は、経路を決めたのと同じ代表tripから取る
    const repStops = (stopTimes.get(repTripId) ?? []).map(([, sid]) => stopNames.get(sid) ?? "");
    out.push({
      feed: feedName, routeId: rid, name, agency, mode, trips: ts.length, pts,
      pathLenM: pathLen(pts),
      nstops: repStops.length,
      firstStop: repStops[0] ?? "",
      lastStop: repStops[repStops.length - 1] ?? "",
    });
  }
  return out;
}
