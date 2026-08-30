/**
 * 診断書(F-2)がサーバーから受け取る値。
 *
 * **25m配列(elev25)は渡さない。** 診断書は表示用の間引いた標高しか使わないので、
 * 渡すとRSCペイロードが無駄に膨らむ(CLAUDE.md アンチパターン)。
 * じぶん補正の再計算に要るのは力行・回生・夏冬の電力量というスカラーだけ。
 */
export interface SheetRow {
  name: string;
  agency: string;
  verdict: string;
  mode: "A" | "B";
  batt: number;
  kwh: number;
  up: number;
  /** 最急勾配 %(judge()は分数なので /100 して渡す) */
  gmax: number;
  emax: number;
  emin: number;
  /** 片道の力行・回生 [kWh] */
  Etr: number;
  regen: number;
  /** 補正(トンネル・高架)した延長 [m] */
  corr: number;
  daily: number;
  charges: number;
  trips: number;
}

export interface SheetProfile {
  elev: number[];
  stepM: number;
  lengthM: number;
  dn: number;
  corrSegments: { startM: number; endM: number; maxCutM: number }[];
  firstStop: string;
  lastStop: string;
  peakIdx: number;
  eSummerKwh: number;
  eWinterKwh: number;
}

export interface SheetSchedule {
  repDayLabel: string;
  repTrips: number;
  totalTrips: number;
  breakdown: { label: string; trips: number }[];
  trips: { dep: string; arr: string }[];
}
