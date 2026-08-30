import { describe, it, expect } from "vitest";
import {
  NO_CALIBRATION, K_MAX, K_MIN,
  auxKwhOf, auxWForMonth, calibratedKwh, fitCalibration, fitDieselKmPerL,
  isIdentity, mape, normalizeCalibration,
  energyForProfile, DEFAULT_EV, SUMMER_AUX_W, WINTER_AUX_W,
  type FitRow,
} from "../src/index";

/** 実測を模した1行を作る: 真の係数で作った消費量を「実測」とする */
function row(mech: number, aux: number, kDrive: number, kAux: number): FitRow {
  return { mechKwh: mech, auxKwh: aux, observedKwh: kDrive * mech + kAux * aux };
}

describe("実測補正(F-4)", () => {
  describe("適用", () => {
    it("無補正は恒等(診断書の値を1kWhも動かさない)", () => {
      const e = energyForProfile([0, 10, 25, 5, 0], 32, WINTER_AUX_W, DEFAULT_EV);
      const aux = auxKwhOf(e.totalKwh, e.tractionKwh, e.regenKwh);
      expect(calibratedKwh(e.tractionKwh, e.regenKwh, aux, NO_CALIBRATION)).toBeCloseTo(e.totalKwh, 12);
      expect(calibratedKwh(e.tractionKwh, e.regenKwh, aux, null)).toBeCloseTo(e.totalKwh, 12);
    });

    it("空調項の逆算が energyForProfile の夏冬差と一致する", () => {
      const elev = [100, 120, 150, 140, 110, 100];
      const s = energyForProfile(elev, 32, SUMMER_AUX_W, DEFAULT_EV);
      const w = energyForProfile(elev, 32, WINTER_AUX_W, DEFAULT_EV);
      const auxS = auxKwhOf(s.totalKwh, s.tractionKwh, s.regenKwh);
      const auxW = auxKwhOf(w.totalKwh, w.tractionKwh, w.regenKwh);
      // 空調は消費電力に比例するだけなので、比は W 値の比になる
      expect(auxW / auxS).toBeCloseTo(WINTER_AUX_W / SUMMER_AUX_W, 10);
    });

    it("係数が各項に別々に効く", () => {
      expect(calibratedKwh(10, 4, 2, { v: 1, kDrive: 1.5, kAux: 0.5, kmPerL: null })).toBeCloseTo(10, 10);
    });

    it("isIdentity", () => {
      expect(isIdentity(NO_CALIBRATION)).toBe(true);
      expect(isIdentity(null)).toBe(true);
      expect(isIdentity({ v: 1, kDrive: 1, kAux: 1, kmPerL: 3.1 })).toBe(false);
    });
  });

  describe("当てはめ", () => {
    it("既知の2係数を復元する(夏冬が混ざっていて分離できる場合)", () => {
      // 距離を変えつつ、季節で空調項の比率を変える
      const rows = [
        row(20, 3.0, 1.15, 0.9), row(30, 4.5, 1.15, 0.9),
        row(20, 8.0, 1.15, 0.9), row(30, 12.0, 1.15, 0.9),
        row(25, 3.75, 1.15, 0.9), row(25, 10.0, 1.15, 0.9),
      ];
      const f = fitCalibration(rows);
      expect(f.separable).toBe(true);
      expect(f.kDrive).toBeCloseTo(1.15, 6);
      expect(f.kAux).toBeCloseTo(0.9, 6);
      expect(f.mapeAfter).toBeLessThan(1e-6);
      expect(f.clamped).toBe(false);
    });

    it("誤差が補正で小さくなる", () => {
      const rows = [
        row(20, 3.0, 1.2, 0.8), row(30, 4.5, 1.2, 0.8),
        row(20, 8.0, 1.2, 0.8), row(30, 12.0, 1.2, 0.8),
      ];
      const f = fitCalibration(rows);
      expect(f.mapeBefore).toBeGreaterThan(f.mapeAfter);
    });

    it("同じ季節・同じ路線だけだと分離できず1係数に落ちる", () => {
      // 空調項が距離に完全比例 = 2列が比例して解が一意に決まらない
      const rows = [10, 20, 30, 40, 50].map((d) => row(d, d * 0.15, 1.2, 1));
      const f = fitCalibration(rows);
      expect(f.separable).toBe(false);
      expect(f.kAux).toBe(1);
      expect(f.mapeAfter).toBeLessThan(f.mapeBefore);
    });

    it("行数が少なすぎるときも1係数に落ちる", () => {
      const f = fitCalibration([row(20, 3, 1.1, 0.9), row(20, 8, 1.1, 0.9)]);
      expect(f.separable).toBe(false);
    });

    it("極端な実測値は係数を値域で頭打ちにする", () => {
      const rows = [10, 20, 30, 40].map((d) => ({ mechKwh: d, auxKwh: 1, observedKwh: d * 99 }));
      const f = fitCalibration(rows);
      expect(f.kDrive).toBe(K_MAX);
      expect(f.clamped).toBe(true);
    });

    it("空の入力は例外", () => {
      expect(() => fitCalibration([])).toThrow();
    });
  });

  describe("ディーゼルの実燃費", () => {
    it("走行距離と給油量の比になる", () => {
      const f = fitDieselKmPerL([{ km: 100, liters: 40 }, { km: 200, liters: 60 }], 2.5);
      expect(f.kmPerL).toBeCloseTo(3.0, 10);
      expect(f.mapeAfter).toBeLessThan(f.mapeBefore);
    });

    it("消費量が0なら例外", () => {
      expect(() => fitDieselKmPerL([{ km: 100, liters: 0 }], 2.5)).toThrow();
    });
  });

  describe("季節の判定", () => {
    it("12〜3月は冬、それ以外は夏", () => {
      expect(auxWForMonth(1)).toBe(WINTER_AUX_W);
      expect(auxWForMonth(3)).toBe(WINTER_AUX_W);
      expect(auxWForMonth(12)).toBe(WINTER_AUX_W);
      expect(auxWForMonth(4)).toBe(SUMMER_AUX_W);
      expect(auxWForMonth(8)).toBe(SUMMER_AUX_W);
      expect(auxWForMonth(11)).toBe(SUMMER_AUX_W);
    });
  });

  describe("保存値の検証(localStorageは信用しない)", () => {
    it("正しい形は通る", () => {
      expect(normalizeCalibration({ v: 1, kDrive: 1.2, kAux: 0.8, kmPerL: null }))
        .toEqual({ v: 1, kDrive: 1.2, kAux: 0.8, kmPerL: null });
    });

    it("余計なキーは落とす", () => {
      const r = normalizeCalibration({ v: 1, kDrive: 1, kAux: 1, kmPerL: null, evil: "x" });
      expect(r).toEqual({ v: 1, kDrive: 1, kAux: 1, kmPerL: null });
    });

    it("壊れた値は null", () => {
      for (const bad of [
        null, undefined, 42, "x", [],
        { v: 2, kDrive: 1, kAux: 1, kmPerL: null },
        { v: 1, kDrive: 0, kAux: 1, kmPerL: null },
        { v: 1, kDrive: K_MAX + 1, kAux: 1, kmPerL: null },
        { v: 1, kDrive: 1, kAux: Number.NaN, kmPerL: null },
        { v: 1, kDrive: 1, kAux: 1, kmPerL: 0 },
        { v: 1, kDrive: 1, kAux: 1, kmPerL: "3" },
        { v: 1, kDrive: 1 },
      ]) {
        expect(normalizeCalibration(bad), JSON.stringify(bad)).toBeNull();
      }
      expect(K_MIN).toBeGreaterThan(0);
    });
  });

  describe("誤差率", () => {
    it("実測0の行は割れないので除く", () => {
      expect(mape([{ actual: 0, predicted: 5 }, { actual: 10, predicted: 11 }])).toBeCloseTo(10, 10);
    });
    it("全行が実測0なら0", () => {
      expect(mape([{ actual: 0, predicted: 5 }])).toBe(0);
    });
  });
});
