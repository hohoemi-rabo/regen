import {
  STEP, SMOOTH_W, GRADE_WIN, DEFAULT_EV, SUMMER_AUX_W, WINTER_AUX_W, VehicleParams,
  cruiseSpeedKmh,
} from "./params";
import { fillNulls, smooth } from "./profile";
import { slopeLimit, anchorInterp } from "./correction";
import { energyForProfile } from "./energy";
import { extraCharges } from "./charging";

export type AccuracyMode = "A" | "B";
export type Verdict = "適" | "条件付き" | "要検討";

export interface DiagnoseInput {
  /** 25m間隔の生標高(欠損はnull可) */
  elev: (number | null)[];
  /** 形状点間隔>100mフラグ(0/1)。resample() の gap */
  gap: number[];
  mode: AccuracyMode;
  /** 停留所のサンプル位置 index(mode B で必須) */
  anchors?: number[];
  /** 1日の便数 */
  trips: number;
}

export interface Diagnosis {
  lengthM: number;
  up: number;
  dn: number;
  gmax: number;
  gmin: number;
  emin: number;
  emax: number;
  tractionKwh: number;
  regenKwh: number;
  eSummerKwh: number;
  eWinterKwh: number;
  kwhPerKm: number;
  roundtripBattPct: number;
  dailyKwh: number;
  extraCharges: number;
  correctedM: number;
  /** 補正が入ったサンプルindex(mode Aのみ。位置の開示 = F-2-8 に使う) */
  correctedIdx: number[];
  verdict: Verdict;
  /** 補正・平滑化後の縦断プロファイル */
  elev: number[];
}

export function judge(battPct: number, gmax: number): Verdict {
  if (battPct < 60 && gmax < 0.1) return "適";
  if (battPct < 85) return "条件付き";
  return "要検討";
}

/** 診断本体(要件定義書 §9.1 の処理順序。Python版 diagnose.py と同一結果を保証: ゴールデンテスト参照) */
export function diagnose(input: DiagnoseInput, veh: VehicleParams = DEFAULT_EV): Diagnosis {
  const raw = fillNulls(input.elev.slice());
  let e = smooth(raw, SMOOTH_W);
  let correctedIdx: number[] = [];
  if (input.mode === "B") {
    e = anchorInterp(e, input.anchors ?? []);
  } else {
    const r = slopeLimit(e);
    e = smooth(r.elev, 5);
    correctedIdx = r.correctedIdx;
  }
  const n = e.length;
  const L = (n - 1) * STEP;
  let up = 0, dn = 0;
  for (let i = 0; i < n - 1; i++) {
    const d = e[i + 1] - e[i];
    if (d > 0) up += d; else dn -= d;
  }
  let gmax = 0, gmin = 0;
  if (n > GRADE_WIN) {
    gmax = -Infinity; gmin = Infinity;
    for (let i = 0; i < n - GRADE_WIN; i++) {
      const g = (e[i + GRADE_WIN] - e[i]) / (GRADE_WIN * STEP);
      if (g > gmax) gmax = g;
      if (g < gmin) gmin = g;
    }
  }
  const vKmh = cruiseSpeedKmh(L);
  const summer = energyForProfile(e, vKmh, SUMMER_AUX_W, veh);
  const winter = energyForProfile(e, vKmh, WINTER_AUX_W, veh);
  const battPct = (2 * winter.totalKwh / veh.batteryKwh) * 100;
  const dailyKwh = input.trips * winter.totalKwh;
  return {
    lengthM: L,
    up, dn, gmax, gmin,
    emin: Math.min(...e),
    emax: Math.max(...e),
    tractionKwh: winter.tractionKwh,
    regenKwh: winter.regenKwh,
    eSummerKwh: summer.totalKwh,
    eWinterKwh: winter.totalKwh,
    kwhPerKm: winter.totalKwh / (L / 1000),
    roundtripBattPct: battPct,
    dailyKwh,
    extraCharges: extraCharges(dailyKwh, veh),
    correctedM: correctedIdx.length * STEP,
    correctedIdx,
    verdict: judge(battPct, gmax),
    elev: e,
  };
}
