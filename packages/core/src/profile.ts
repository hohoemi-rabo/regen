import { STEP } from "./params";

/** 欠損(null)を前後の値から埋める(Python版 fill_nulls と同一挙動: 昇順に埋め、埋めた値も後続の参照対象になる) */
export function fillNulls(arr: (number | null)[]): number[] {
  const a = arr as (number | null)[];
  const n = a.length;
  for (let i = 0; i < n; i++) {
    if (a[i] === null || a[i] === undefined) {
      let prev: number | null = null;
      for (let k = i - 1; k >= 0; k--) { const v = a[k]; if (v !== null && v !== undefined) { prev = v as number; break; } }
      let next: number | null = null;
      for (let k = i + 1; k < n; k++) { const v = a[k]; if (v !== null && v !== undefined) { next = v as number; break; } }
      a[i] = next === null ? (prev as number) : prev === null ? next : (prev + next) / 2;
    }
  }
  return a as number[];
}

/** 中心移動平均。端は窓が縮む(Python版 smooth と同一) */
export function smooth(v: number[], w = 7): number[] {
  const n = v.length;
  const out = new Array<number>(n);
  const half = Math.floor(w / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    let s = 0;
    for (let k = a; k < b; k++) s += v[k];
    out[i] = s / (b - a);
  }
  return out;
}

const RE = 6371000;
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * RE * Math.asin(Math.sqrt(x));
}

export interface Resampled {
  lat: number[];
  lon: number[];
  dist: number[];
  /** その点が「形状点間隔>gapFlag[m]の区間」由来なら1(コーナーカット・トンネル疑い) */
  gap: number[];
}

/** 経路座標列を step[m] 間隔に等間隔化(Python版 resample と同一挙動) */
export function resample(pts: [number, number][], step = STEP, gapFlag = 100): Resampled {
  const lat: number[] = [pts[0][0]];
  const lon: number[] = [pts[0][1]];
  const dist: number[] = [0];
  const gap: number[] = [0];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    let [la1, lo1] = pts[i];
    const [la2, lo2] = pts[i + 1];
    let seg = haversine(la1, lo1, la2, lo2);
    if (seg === 0) continue;
    const big = seg > gapFlag ? 1 : 0;
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      const la = la1 + (la2 - la1) * t;
      const lo = lo1 + (lo2 - lo1) * t;
      lat.push(la); lon.push(lo);
      dist.push(dist[dist.length - 1] + step);
      gap.push(big);
      la1 = la; lo1 = lo;
      seg = seg - (step - acc);
      acc = 0;
    }
    acc += seg;
  }
  return { lat, lon, dist, gap };
}
