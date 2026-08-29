/**
 * 診断の既定パラメータ(要件定義書 §9.2)。
 * 値を変えるとゴールデンテストが落ちる。変える場合はフィクスチャ再生成とセットで。
 */
export const STEP = 25;            // サンプリング間隔 [m]
export const MAX_GRADE = 0.12;     // 勾配上限フィルタのしきい値
export const SMOOTH_W = 7;         // 平滑化窓(175m)
export const GRADE_WIN = 20;       // 持続勾配の窓(500m)
export const G = 9.81;
export const RHO = 1.2;            // 空気密度

export interface VehicleParams {
  massKg: number;
  cda: number;
  crr: number;
  driveEff: number;
  regenEff: number;
  batteryKwh: number;
  usableRatio: number;
}

export const DEFAULT_EV: VehicleParams = {
  massKg: 8500,
  cda: 5.0,
  crr: 0.008,
  driveEff: 0.85,
  regenEff: 0.62,
  batteryKwh: 105,
  usableRatio: 0.8,
};

export const SUMMER_AUX_W = 3000;  // 夏季空調 [W]
export const WINTER_AUX_W = 8000;  // 冬季暖房 [W]

export const PRICE = {
  yenPerKwh: 30,
  yenPerLiterDiesel: 165,
  dieselKmPerL: 2.5,
};
