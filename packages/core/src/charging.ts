import { VehicleParams } from "./params";

/** 朝満充電スタートで1日のダイヤを走り切るために必要な日中の追加充電回数 */
export function extraCharges(dailyKwh: number, veh: VehicleParams): number {
  const usable = veh.batteryKwh * veh.usableRatio;
  return Math.max(0, Math.ceil(dailyKwh / usable) - 1);
}

export interface ChargingStop {
  /** 何便目の走行後に充電が要るか(1始まり) */
  afterTrip: number;
  /** その便の終着時刻 "HH:MM"(充電を始められる時刻の目安) */
  at: string;
  /** 充電直前の残量 [kWh] */
  remainingKwh: number;
}

export interface ChargingPlan {
  /** 代表運行日の便数 */
  trips: number;
  /** 代表運行日に必要な電力量 [kWh] */
  dayKwh: number;
  usableKwh: number;
  stops: ChargingStop[];
}

/**
 * 実ダイヤに沿った充電計画(F-2-5)。
 * 朝満充電で出庫し、便ごとに片道電力量を引く。次の便を走ると使用可能容量を
 * 下回る時点で、その手前の便の終着時刻を充電タイミングとして返す。
 * arrivals は便の終着時刻 "HH:MM" を運行順に並べたもの。
 */
export function chargingPlan(
  kwhPerTrip: number,
  arrivals: string[],
  veh: VehicleParams
): ChargingPlan {
  const usable = veh.batteryKwh * veh.usableRatio;
  const stops: ChargingStop[] = [];
  let remaining = usable;
  for (let i = 0; i < arrivals.length; i++) {
    if (remaining < kwhPerTrip && i > 0) {
      stops.push({ afterTrip: i, at: arrivals[i - 1], remainingKwh: remaining });
      remaining = usable;
    }
    remaining -= kwhPerTrip;
  }
  return {
    trips: arrivals.length,
    dayKwh: kwhPerTrip * arrivals.length,
    usableKwh: usable,
    stops,
  };
}
