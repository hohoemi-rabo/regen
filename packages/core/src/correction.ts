import { STEP, MAX_GRADE } from "./params";

export interface SlopeLimitResult {
  elev: number[];
  /** 補正が入ったサンプル index(元標高との差>5m) */
  correctedIdx: number[];
}

/**
 * 勾配上限フィルタ(トンネル・高架補正)。
 * 前方・後方の両方向スイープで「勾配 maxGrade 以下では到達できない標高」を削り、
 * DEMがトンネル上の地表を拾った箇所の縦断線を復元する。
 * 緩やかに登って到達する実在の峠(例: 治部坂峠1,196m)は保持される。
 */
export function slopeLimit(e: number[], maxGrade = MAX_GRADE, step = STEP): SlopeLimitResult {
  const n = e.length;
  const rise = maxGrade * step;
  const f = new Array<number>(n);
  f[0] = e[0];
  for (let i = 1; i < n; i++) f[i] = Math.min(e[i], f[i - 1] + rise);
  const b = new Array<number>(n);
  b[n - 1] = e[n - 1];
  for (let i = n - 2; i >= 0; i--) b[i] = Math.min(e[i], b[i + 1] + rise);
  const lim = new Array<number>(n);
  const correctedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    lim[i] = Math.min(f[i], b[i]);
    if (e[i] - lim[i] > 5.0) correctedIdx.push(i);
  }
  return { elev: lim, correctedIdx };
}

/**
 * 精度ランクB(shapes.txtなし)用の停留所アンカー補間。
 * 停留所を直線で結んだ近似形状は実際の道路を通らないため、
 * 停留所地点の標高のみを信頼し、区間は線形補間する(登坂量の下限推定)。
 */
export function anchorInterp(e: number[], anchors: number[]): number[] {
  const n = e.length;
  const set = Array.from(new Set(anchors.filter((a) => a >= 0 && a < n))).sort((x, y) => x - y);
  if (set.length < 2) return e.slice();
  if (set[0] !== 0) set.unshift(0);
  if (set[set.length - 1] !== n - 1) set.push(n - 1);
  const out = new Array<number>(n).fill(0);
  for (let k = 0; k < set.length - 1; k++) {
    const a = set[k], b = set[k + 1];
    const ea = e[a], eb = e[b];
    for (let i = a; i <= b; i++) out[i] = b === a ? ea : ea + ((eb - ea) * (i - a)) / (b - a);
  }
  return out;
}
