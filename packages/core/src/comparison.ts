import { CO2, PRICE } from "./params";

export interface DieselComparison {
  /** EVの電気代 [円] */
  evYen: number;
  /** ディーゼルの軽油代 [円] */
  dieselYen: number;
  /** 節約額 [円](正なら EV が安い) */
  savedYen: number;
  /** EVのCO2 [kg](発電由来を含む) */
  evCo2Kg: number;
  /** ディーゼルのCO2 [kg] */
  dieselCo2Kg: number;
  /** 削減量 [kg] */
  savedCo2Kg: number;
  /** 消費軽油量 [L] */
  dieselLiters: number;
}

/**
 * 同じ距離をディーゼル車で走った場合との比較(F-2-6)。
 * CO2はEV側も発電由来を計上する(走行時ゼロとはしない)。係数は params.ts / 画面で開示。
 */
export function compareDiesel(kwh: number, lengthKm: number): DieselComparison {
  const liters = lengthKm / PRICE.dieselKmPerL;
  const evYen = kwh * PRICE.yenPerKwh;
  const dieselYen = liters * PRICE.yenPerLiterDiesel;
  const evCo2Kg = kwh * CO2.gridKgPerKwh;
  const dieselCo2Kg = liters * CO2.dieselKgPerL;
  return {
    evYen,
    dieselYen,
    savedYen: dieselYen - evYen,
    evCo2Kg,
    dieselCo2Kg,
    savedCo2Kg: dieselCo2Kg - evCo2Kg,
    dieselLiters: liters,
  };
}
