import { STEP, G, RHO, VehicleParams } from "./params";

export interface EnergyResult {
  tractionKwh: number;
  regenKwh: number;
  /** 空調込みの正味消費 [kWh] */
  totalKwh: number;
}

/**
 * 25m区間ごとの力行/回生の積算(要件定義書 §9.1-5,6)。
 * F = m·g·Crr + ½·ρ·CdA·v² + m·g·(dh/dx)
 */
export function energyForProfile(
  e: number[],
  vKmh: number,
  auxW: number,
  veh: VehicleParams,
  step = STEP
): EnergyResult {
  const v = vKmh / 3.6;
  const m = veh.massKg;
  let etr = 0;
  let ereg = 0;
  for (let i = 0; i < e.length - 1; i++) {
    const dh = e[i + 1] - e[i];
    const F = m * G * veh.crr + 0.5 * RHO * veh.cda * v * v + m * G * (dh / step);
    const Wk = F * step;
    if (Wk > 0) etr += Wk / veh.driveEff;
    else ereg += -Wk * veh.regenEff;
  }
  const L = (e.length - 1) * step;
  const tH = L / 1000 / vKmh;
  const total = (etr - ereg + auxW * tH * 3600) / 3.6e6;
  return { tractionKwh: etr / 3.6e6, regenKwh: ereg / 3.6e6, totalKwh: total };
}
