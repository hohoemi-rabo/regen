import { VehicleParams } from "./params";

/** 朝満充電スタートで1日のダイヤを走り切るために必要な日中の追加充電回数 */
export function extraCharges(dailyKwh: number, veh: VehicleParams): number {
  const usable = veh.batteryKwh * veh.usableRatio;
  return Math.max(0, Math.ceil(dailyKwh / usable) - 1);
}
