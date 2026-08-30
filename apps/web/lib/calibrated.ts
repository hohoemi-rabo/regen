/**
 * じぶん補正(F-4)を路線の表示値に当てる。
 *
 * **標高プロファイルを読まない。** 力行・回生・冬電力量の3つのスカラーがあれば、
 * 空調項は引き算で出るので、掛け算だけで補正後の値が出る。
 * だから46路線の一覧でもマップでも一瞬で効く(要件§3.2「重い計算はバッチ」を崩さない)。
 *
 * **補正が無いときはバッチが出した値をそのまま返す。** 再計算して同じ値になるはずでも、
 * 丸めの差で1つでも動くとバッチ・D1・共有ページと食い違う。無補正は素通しにする。
 *
 * サーバー・クライアントの両方から使えるように、server-only なものを import しない。
 */
import {
  DEFAULT_EV,
  DEFAULT_THRESHOLDS,
  auxKwhOf,
  calibratedKwh,
  extraCharges,
  isDefaultThresholds,
  isIdentity,
  judge,
  type Calibration,
  type Thresholds,
} from "@regen/core";

export interface RouteBase {
  // --- バッチが出した表示値(無補正のときはこれをそのまま返す) ---
  verdict: string;
  kwhPerKm: number;
  roundtripBattPct: number;
  dailyKwh: number;
  extraCharges: number;

  // --- 補正時の再計算に使う値 ---
  /** 片道の力行・回生 [kWh] */
  tractionKwh: number;
  regenKwh: number;
  /** 片道の冬の電力量 [kWh] */
  winterKwh: number;
  lengthKm: number;
  tripsPerDay: number;
  /** 最急勾配。**分数**(0.106 = 10.6%)。丸めた%から戻した値を渡さないこと */
  maxGrade: number;
}

export interface RouteFigures {
  verdict: string;
  kwhPerKm: number;
  roundtripBattPct: number;
  dailyKwh: number;
  extraCharges: number;
}

/**
 * @param thresholds 判定しきい値(F-7-4)。既定と違えば判定を計算し直す。
 *   一覧はD1の判定が管理画面の保存時に更新されるが、**マップはR2に焼かれた判定を読む**ので、
 *   次のバッチまではここで計算し直さないと古い色が出る。
 */
export function calibrateRoute(
  base: RouteBase,
  calib: Calibration | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): RouteFigures {
  if (isIdentity(calib) && isDefaultThresholds(thresholds)) {
    return {
      verdict: base.verdict,
      kwhPerKm: base.kwhPerKm,
      roundtripBattPct: base.roundtripBattPct,
      dailyKwh: base.dailyKwh,
      extraCharges: base.extraCharges,
    };
  }

  const aux = auxKwhOf(base.winterKwh, base.tractionKwh, base.regenKwh);
  // 補正が無ければ電力量は動かない(丸めの差で数字がぶれないよう保存値を使う)
  const tripKwh = isIdentity(calib)
    ? base.winterKwh
    : calibratedKwh(base.tractionKwh, base.regenKwh, aux, calib);
  const battPct = ((2 * tripKwh) / DEFAULT_EV.batteryKwh) * 100;
  const dailyKwh = tripKwh * base.tripsPerDay;
  return {
    kwhPerKm: tripKwh / base.lengthKm,
    roundtripBattPct: battPct,
    dailyKwh,
    extraCharges: extraCharges(dailyKwh, DEFAULT_EV),
    // 判定は補正後の値としきい値で出し直す。勾配は地形なので補正の対象ではない
    verdict: judge(battPct, base.maxGrade, thresholds),
  };
}
