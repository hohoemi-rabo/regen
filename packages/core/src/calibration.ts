/**
 * 実測補正「じぶん補正」(F-4)。
 *
 * energyForProfile() は total = (力行 − 回生 + 空調W×時間) の形で、この2項に対して線形。
 * そこで乗数を2つ置く:
 *
 *     補正後kWh = kDrive × (力行kWh − 回生kWh) + kAux × 空調kWh
 *
 * この形にしておくと、**再計算に標高プロファイルが要らない**。力行・回生・空調の3つの
 * スカラーさえあれば掛け算だけで補正後の値が出るので、一覧46行でもマップでも即座に効く
 * (要件§3.2「重い計算はバッチ、画面は表示だけ」を崩さない)。
 *
 * DEMのトンネル補正(correction.ts)とは無関係。あちらは地形、こちらは実測合わせ。
 */
import { SUMMER_AUX_W, WINTER_AUX_W } from "./params";

/** 係数の許容範囲。これを外れる推定は実測かモデルのどちらかが壊れている */
export const K_MIN = 0.3;
export const K_MAX = 3.0;
/** 実燃費 [km/L] の許容範囲 */
export const KM_PER_L_MIN = 0.5;
export const KM_PER_L_MAX = 30;

export interface Calibration {
  /** 形式版。将来キーを増やすときに読み分ける */
  v: 1;
  /** 車両効率の係数(転がり・空気・駆動効率・運転の癖をまとめて吸収) */
  kDrive: number;
  /** 空調負荷の係数 */
  kAux: number;
  /** 実測の軽油燃費 [km/L]。ディーゼルのCSVを読んだときだけ入る */
  kmPerL: number | null;
}

/** 無補正(恒等)。補正が無い状態はこれで表す */
export const NO_CALIBRATION: Calibration = { v: 1, kDrive: 1, kAux: 1, kmPerL: null };

export function isIdentity(c: Calibration | null | undefined): boolean {
  return !c || (c.kDrive === 1 && c.kAux === 1 && c.kmPerL === null);
}

/**
 * 空調項 [kWh] の逆算。
 * energyForProfile は空調込みの total しか返さないが、力行・回生も返すので引けば出る。
 */
export function auxKwhOf(totalKwh: number, tractionKwh: number, regenKwh: number): number {
  return totalKwh - (tractionKwh - regenKwh);
}

/** 補正の適用。c を省略すると無補正(= 元の値) */
export function calibratedKwh(
  tractionKwh: number,
  regenKwh: number,
  auxKwh: number,
  c?: Calibration | null
): number {
  const k = c ?? NO_CALIBRATION;
  return k.kDrive * (tractionKwh - regenKwh) + k.kAux * auxKwh;
}

/** 月から空調負荷 [W] を決める。12〜3月を冬、それ以外を夏とする(要件§9.2の2値しかないため) */
export function auxWForMonth(month1to12: number): number {
  return month1to12 >= 12 || month1to12 <= 3 ? WINTER_AUX_W : SUMMER_AUX_W;
}

// ---------------------------------------------------------------------------
// 当てはめ
// ---------------------------------------------------------------------------

export interface FitRow {
  /** 距離・地形に比例する項 [kWh] = (力行−回生)/km × 走行距離 */
  mechKwh: number;
  /** 時間に比例する項 [kWh] = 空調W(季節) × 運行時間 / 1000 */
  auxKwh: number;
  /** 実測の消費電力量 [kWh] */
  observedKwh: number;
}

export interface FitResult {
  kDrive: number;
  kAux: number;
  /** 空調を分離できたか。false なら kAux=1 固定で kDrive だけを当てている */
  separable: boolean;
  /** 係数が K_MIN/K_MAX で頭打ちになったか */
  clamped: boolean;
  /** 補正前の平均絶対誤差率 [%] */
  mapeBefore: number;
  /** 補正後の平均絶対誤差率 [%] */
  mapeAfter: number;
  rows: number;
}

const clampK = (v: number) => Math.min(K_MAX, Math.max(K_MIN, v));

/** 平均絶対誤差率 [%]。実測が0の行は割れないので除く */
export function mape(pairs: { actual: number; predicted: number }[]): number {
  const usable = pairs.filter((p) => p.actual !== 0);
  if (usable.length === 0) return 0;
  const sum = usable.reduce((s, p) => s + Math.abs(p.predicted - p.actual) / Math.abs(p.actual), 0);
  return (sum / usable.length) * 100;
}

/** 2列の相関係数。1に近いほど「2つの項が比例していて分離できない」 */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 1; // どちらかが定数 = 分離できない
  return sxy / Math.sqrt(sxx * syy);
}

/** これを超える相関だと2係数の解が数値的に信用できない */
const SEPARABLE_MAX_CORR = 0.999;
/** 2係数を当てるのに最低限ほしい行数 */
const SEPARABLE_MIN_ROWS = 4;

/**
 * 実測から kDrive / kAux を当てる(F-4-3)。
 *
 * y ≈ kDrive·mech + kAux·aux を最小二乗で解く(2×2の正規方程式。反復なし)。
 * **同じ路線・同じ季節のデータだけだと mech と aux が比例して解が一意に決まらない。**
 * その場合は kAux=1 に固定して kDrive だけを当て、separable=false を返す。
 * 呼び出し側はそれを画面に明示すること。
 */
export function fitCalibration(rows: FitRow[]): FitResult {
  if (rows.length === 0) throw new Error("実測データが1行もありません");

  const before = mape(rows.map((r) => ({ actual: r.observedKwh, predicted: r.mechKwh + r.auxKwh })));
  const mech = rows.map((r) => r.mechKwh);
  const aux = rows.map((r) => r.auxKwh);

  const separable =
    rows.length >= SEPARABLE_MIN_ROWS && Math.abs(correlation(mech, aux)) < SEPARABLE_MAX_CORR;

  let kDrive: number;
  let kAux: number;
  if (separable) {
    // [ Σmm Σma ] [kDrive]   [ Σmy ]
    // [ Σma Σaa ] [ kAux ] = [ Σay ]
    let mm = 0, ma = 0, aa = 0, my = 0, ay = 0;
    for (const r of rows) {
      mm += r.mechKwh * r.mechKwh;
      ma += r.mechKwh * r.auxKwh;
      aa += r.auxKwh * r.auxKwh;
      my += r.mechKwh * r.observedKwh;
      ay += r.auxKwh * r.observedKwh;
    }
    const det = mm * aa - ma * ma;
    if (det === 0) return fitDriveOnly(rows, before);
    kDrive = (my * aa - ay * ma) / det;
    kAux = (mm * ay - ma * my) / det;
  } else {
    return fitDriveOnly(rows, before);
  }

  const clamped = kDrive !== clampK(kDrive) || kAux !== clampK(kAux);
  kDrive = clampK(kDrive);
  kAux = clampK(kAux);
  const after = mape(
    rows.map((r) => ({ actual: r.observedKwh, predicted: kDrive * r.mechKwh + kAux * r.auxKwh }))
  );
  return { kDrive, kAux, separable: true, clamped, mapeBefore: before, mapeAfter: after, rows: rows.length };
}

/** kAux=1 固定で kDrive だけを当てる(空調を分離できないとき) */
function fitDriveOnly(rows: FitRow[], before: number): FitResult {
  let mm = 0, my = 0;
  for (const r of rows) {
    mm += r.mechKwh * r.mechKwh;
    my += r.mechKwh * (r.observedKwh - r.auxKwh);
  }
  const raw = mm === 0 ? 1 : my / mm;
  const kDrive = clampK(raw);
  const after = mape(
    rows.map((r) => ({ actual: r.observedKwh, predicted: kDrive * r.mechKwh + r.auxKwh }))
  );
  return {
    kDrive,
    kAux: 1,
    separable: false,
    clamped: raw !== kDrive,
    mapeBefore: before,
    mapeAfter: after,
    rows: rows.length,
  };
}

export interface DieselFitRow {
  km: number;
  liters: number;
}

export interface DieselFitResult {
  kmPerL: number;
  clamped: boolean;
  mapeBefore: number;
  mapeAfter: number;
  rows: number;
}

/**
 * 軽油の実測から実燃費 [km/L] を当てる。
 *
 * **軽油消費から車両効率(kDrive/kAux)は出さない。** そのためにはエンジンの熱効率を
 * 仮定する必要があり、その仮定がそのまま係数に化けて意味を失うため。
 * ディーゼル比較(F-2-6)とTCOの燃料費だけを実力値にする。
 */
export function fitDieselKmPerL(rows: DieselFitRow[], baselineKmPerL: number): DieselFitResult {
  if (rows.length === 0) throw new Error("実測データが1行もありません");
  const totalKm = rows.reduce((s, r) => s + r.km, 0);
  const totalL = rows.reduce((s, r) => s + r.liters, 0);
  if (totalL <= 0) throw new Error("消費量の合計が0です");

  const raw = totalKm / totalL;
  const kmPerL = Math.min(KM_PER_L_MAX, Math.max(KM_PER_L_MIN, raw));
  const before = mape(rows.map((r) => ({ actual: r.liters, predicted: r.km / baselineKmPerL })));
  const after = mape(rows.map((r) => ({ actual: r.liters, predicted: r.km / kmPerL })));
  return { kmPerL, clamped: raw !== kmPerL, mapeBefore: before, mapeAfter: after, rows: rows.length };
}

// ---------------------------------------------------------------------------
// 保存値の検証
// ---------------------------------------------------------------------------

/**
 * localStorage から読んだ値を正規形に詰め替える。壊れていれば null。
 *
 * **localStorage は利用者が書き換えられる入力**なので信用しない。
 * scenario.ts の normalizeScenarioParams と同じ作法(ホワイトリスト + 値域)。
 */
export function normalizeCalibration(raw: unknown): Calibration | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;

  const k = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= K_MIN && v <= K_MAX ? v : null;

  const kDrive = k(o.kDrive);
  const kAux = k(o.kAux);
  if (kDrive === null || kAux === null) return null;

  let kmPerL: number | null = null;
  if (o.kmPerL !== null && o.kmPerL !== undefined) {
    const v = o.kmPerL;
    if (typeof v !== "number" || !Number.isFinite(v) || v < KM_PER_L_MIN || v > KM_PER_L_MAX) {
      return null;
    }
    kmPerL = v;
  }
  return { v: 1, kDrive, kAux, kmPerL };
}
