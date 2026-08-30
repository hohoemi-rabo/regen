import { CO2, STEP, VehicleParams, cruiseSpeedKmh } from "./params";
import { energyForProfile } from "./energy";
import { ChargingStop, chargingPlan } from "./charging";
import { judge, Verdict } from "./diagnose";
import { Powertrain, Vehicle, toVehicleParams } from "./vehicles";
import { auxKwhOf, calibratedKwh, type Calibration } from "./calibration";

/**
 * F-3車両比較の再計算(ブラウザ内で実行される)。
 *
 * diagnose() は使わない。補正・平滑化は車両に依存しないため事前計算済みで、
 * 車両を差し替えて変わるのはエネルギー積算から先だけだから。
 * elev には**25m間隔の補正後プロファイル**(diagnose().elev 相当)を渡すこと。
 * 間引いた表示用プロファイルを渡すと診断書と数値が食い違う。
 */
export interface SimInput {
  /** 25m間隔の補正後標高 [m] */
  elev: number[];
  lengthM: number;
  /** 最急勾配。**分数**(10.6% なら 0.106)。routes_summary は%表記なので /100 すること */
  gmax: number;
  /** 代表運行日の便数 */
  tripsPerDay: number;
  /** 代表運行日の各便の終着時刻 "HH:MM" */
  arrivals: string[];
  /** 空調負荷 [W] */
  auxW: number;
  yenPerKwh: number;
  yenPerLiterDiesel: number;
  /**
   * 実測補正(F-4)。省略すると無補正で、現在と完全に同じ値になる。
   * ブラウザのローカル保存にとどまる値なので、サーバー側の事前計算には入れない。
   */
  calib?: Calibration | null;
}

export interface SimResult {
  powertrain: Powertrain;
  /** EVのみ。ディーゼルは null */
  kwhPerTrip: number | null;
  kwhPerKm: number | null;
  tractionKwh: number | null;
  regenKwh: number | null;
  roundtripBattPct: number | null;
  verdict: Verdict | null;
  dayKwh: number | null;
  extraCharges: number | null;
  stops: ChargingStop[];
  /** ディーゼルのみ */
  litersPerTrip: number | null;
  dayLiters: number | null;
  /**
   * 1便が使用可能容量を超えていて、この車両ではこの路線が成立しないこと。
   * true のとき充電計画(stops/extraCharges)は算出できない(charging.ts の前提)。
   */
  infeasible: boolean;
  /** 代表運行日1日あたりの燃料・電力費 [円] */
  dayYen: number;
  /** 代表運行日1日あたりのCO2 [kg] */
  dayCo2Kg: number;
}

/** 車両1台をこの路線で走らせた場合の1日 */
export function simulateVehicle(
  v: Vehicle,
  over: { massKg?: number; batteryKwh?: number } | undefined,
  input: SimInput
): SimResult {
  const lengthKm = input.lengthM / 1000;
  const veh: VehicleParams = toVehicleParams(v, over);

  if (v.powertrain === "diesel") {
    // 燃費[km/L]は車両マスタの値。ディーゼルはエネルギー積算をしない(実測燃費のほうが確かなため)
    // 実測補正があればそちらを使う(実燃費のほうが車両マスタの公称値より確か)
    const kmPerL = input.calib?.kmPerL ?? v.fuelKmPerL ?? 0;
    const litersPerTrip = kmPerL > 0 ? lengthKm / kmPerL : 0;
    const dayLiters = litersPerTrip * input.tripsPerDay;
    return {
      powertrain: "diesel",
      kwhPerTrip: null, kwhPerKm: null, tractionKwh: null, regenKwh: null,
      roundtripBattPct: null, verdict: null, dayKwh: null,
      extraCharges: null, stops: [],
      litersPerTrip, dayLiters,
      infeasible: false,
      dayYen: dayLiters * input.yenPerLiterDiesel,
      dayCo2Kg: dayLiters * CO2.dieselKgPerL,
    };
  }

  const e = energyForProfile(input.elev, cruiseSpeedKmh(input.lengthM), input.auxW, veh, STEP);
  // 力行・回生・空調の3項に係数を掛ける(calibration.ts)。無補正なら e.totalKwh と一致する
  const kwhPerTrip = calibratedKwh(
    e.tractionKwh,
    e.regenKwh,
    auxKwhOf(e.totalKwh, e.tractionKwh, e.regenKwh),
    input.calib
  );
  const dayKwh = kwhPerTrip * input.tripsPerDay;
  const usableKwh = veh.batteryKwh * veh.usableRatio;
  // charging.ts は片道が使用可能容量を超える車両を表現できない。先に成立性を判定する
  const infeasible = !(veh.batteryKwh > 0) || kwhPerTrip > usableKwh;
  const plan = infeasible ? null : chargingPlan(kwhPerTrip, input.arrivals, veh);
  const battPct = veh.batteryKwh > 0 ? (2 * kwhPerTrip / veh.batteryKwh) * 100 : Infinity;

  return {
    powertrain: "ev",
    kwhPerTrip,
    kwhPerKm: kwhPerTrip / lengthKm,
    tractionKwh: e.tractionKwh,
    regenKwh: e.regenKwh,
    roundtripBattPct: battPct,
    verdict: judge(battPct, input.gmax),
    dayKwh,
    extraCharges: plan ? plan.stops.length : null,
    stops: plan ? plan.stops : [],
    litersPerTrip: null, dayLiters: null,
    infeasible,
    dayYen: dayKwh * input.yenPerKwh,
    dayCo2Kg: dayKwh * CO2.gridKgPerKwh,
  };
}

/**
 * TCO(F-3-3)。含めるのは**車両価格・補助金・エネルギー費のみ**。
 * 整備費・充電器設置費・人件費は含めない(要件§13-5の判断。画面で明記する)。
 */
export interface TcoInput {
  /** 初期費用 = 車両価格 − 補助金 [円] */
  initialYenA: number;
  initialYenB: number;
  /** 年間のエネルギー費 [円] */
  annualYenA: number;
  annualYenB: number;
  /** グラフの右端 [年] */
  years: number;
}

export interface TcoPoint { year: number; a: number; b: number }

export function tcoSeries(i: TcoInput): TcoPoint[] {
  const out: TcoPoint[] = [];
  for (let y = 0; y <= i.years; y++) {
    out.push({
      year: y,
      a: i.initialYenA + i.annualYenA * y,
      b: i.initialYenB + i.annualYenB * y,
    });
  }
  return out;
}

/**
 * 累計コストが逆転する年。期間内に交わらなければ null。
 * 初期費用が高いほうの年間費用も高い(=永久に追いつけない)場合も null。
 */
export function breakEvenYear(i: TcoInput): number | null {
  // A が初期に余分に払う額 = B が毎年余分に払う額 × y
  const dInitial = i.initialYenA - i.initialYenB;
  const dAnnual = i.annualYenB - i.annualYenA;
  if (dAnnual === 0) return null; // 年間費用が同じなら差は縮まらない
  const y = dInitial / dAnnual;
  // yが負 = 初期費用が高い側の年間費用も高く、差は開く一方
  return y >= 0 && y <= i.years ? y : null;
}
