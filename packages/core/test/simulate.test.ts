import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEFAULT_EV,
  breakEvenYear,
  diagnose,
  findVehicle,
  simulateVehicle,
  tcoSeries,
  toVehicleParams,
  type DiagnoseInput,
  type SimInput,
} from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
/** フィクスチャは diagnose() の入力そのものに id を足した形 */
type GoldenRoute = DiagnoseInput & { id: string };
const fx = JSON.parse(readFileSync(join(here, "fixtures", "golden.json"), "utf-8")) as {
  routes: GoldenRoute[];
};

/** ゴールデンの生標高から、F-3がブラウザで受け取るのと同じ25m補正後プロファイルを作る */
function profileOf(r: GoldenRoute) {
  const d = diagnose({ elev: r.elev, gap: r.gap, mode: r.mode, anchors: r.anchors, trips: r.trips });
  return { d, elev: d.elev };
}

const route = fx.routes[0];
const { d, elev } = profileOf(route);

function inputFor(over: Partial<SimInput> = {}): SimInput {
  return {
    elev,
    lengthM: d.lengthM,
    gmax: d.gmax,
    tripsPerDay: route.trips,
    // 充電計画は時刻の並びだけ使う。等間隔のダミーで十分
    arrivals: Array.from({ length: route.trips }, (_, i) =>
      `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
    ),
    auxW: 8000,
    yenPerKwh: 30,
    yenPerLiterDiesel: 165,
    ...over,
  };
}

describe("simulateVehicle", () => {
  const standard = findVehicle("standard-ev")!;

  it("標準EVバスは diagnose() と同じ電費・往復電池%になる(診断書と食い違わないこと)", () => {
    const s = simulateVehicle(standard, undefined, inputFor());
    expect(s.kwhPerTrip!).toBeCloseTo(d.eWinterKwh, 10);
    expect(s.kwhPerKm!).toBeCloseTo(d.kwhPerKm, 10);
    expect(s.roundtripBattPct!).toBeCloseTo(d.roundtripBattPct, 10);
    expect(s.verdict).toBe(d.verdict);
    expect(s.infeasible).toBe(false);
  });

  it("standard-ev の VehicleParams は DEFAULT_EV と一致する", () => {
    expect(toVehicleParams(standard)).toEqual(DEFAULT_EV);
  });

  it("空調を夏(3kW)にすると冬より消費が減る", () => {
    const winter = simulateVehicle(standard, undefined, inputFor());
    const summer = simulateVehicle(standard, undefined, inputFor({ auxW: 3000 }));
    expect(summer.kwhPerTrip!).toBeLessThan(winter.kwhPerTrip!);
    expect(summer.kwhPerTrip!).toBeCloseTo(d.eSummerKwh, 10);
  });

  it("重量を増やすと消費が増える", () => {
    const light = simulateVehicle(standard, { massKg: 8000 }, inputFor());
    const heavy = simulateVehicle(standard, { massKg: 13000 }, inputFor());
    expect(heavy.kwhPerTrip!).toBeGreaterThan(light.kwhPerTrip!);
  });

  it("電池を増やしても電費は変わらず、往復電池%と充電回数だけ下がる", () => {
    const small = simulateVehicle(standard, { batteryKwh: 105 }, inputFor());
    const big = simulateVehicle(standard, { batteryKwh: 250 }, inputFor());
    expect(big.kwhPerKm!).toBeCloseTo(small.kwhPerKm!, 10);
    expect(big.roundtripBattPct!).toBeLessThan(small.roundtripBattPct!);
    expect(big.extraCharges!).toBeLessThanOrEqual(small.extraCharges!);
  });

  it("1便を走り切れない電池では infeasible になり、充電計画を出さない", () => {
    const s = simulateVehicle(standard, { batteryKwh: 5 }, inputFor());
    expect(s.infeasible).toBe(true);
    expect(s.extraCharges).toBeNull();
    expect(s.stops).toEqual([]);
    // 電費とコストは成立しなくても出せる
    expect(s.kwhPerKm!).toBeGreaterThan(0);
    expect(s.dayYen).toBeGreaterThan(0);
  });

  it("ディーゼルは燃費から軽油量を出し、電気側の指標は null にする", () => {
    const poncho = findVehicle("hino-poncho")!;
    const s = simulateVehicle(poncho, undefined, inputFor());
    expect(s.powertrain).toBe("diesel");
    expect(s.kwhPerKm).toBeNull();
    expect(s.roundtripBattPct).toBeNull();
    expect(s.verdict).toBeNull();
    expect(s.extraCharges).toBeNull();
    expect(s.infeasible).toBe(false);
    const lengthKm = d.lengthM / 1000;
    expect(s.litersPerTrip!).toBeCloseTo(lengthKm / poncho.fuelKmPerL!, 10);
    expect(s.dayYen).toBeCloseTo(s.dayLiters! * 165, 10);
  });

  it("単価スライダーが1日あたりコストに線形に効く", () => {
    const a = simulateVehicle(standard, undefined, inputFor({ yenPerKwh: 30 }));
    const b = simulateVehicle(standard, undefined, inputFor({ yenPerKwh: 60 }));
    expect(b.dayYen).toBeCloseTo(a.dayYen * 2, 6);
  });
});

describe("TCO", () => {
  const base = { initialYenA: 19_500_000, initialYenB: 15_410_000, annualYenA: 500_000, annualYenB: 1_200_000, years: 15 };

  it("累計コストは初期費用 + 年間費用 × 年", () => {
    const s = tcoSeries(base);
    expect(s).toHaveLength(16);
    expect(s[0]).toEqual({ year: 0, a: 19_500_000, b: 15_410_000 });
    expect(s[10].a).toBe(19_500_000 + 5_000_000);
    expect(s[10].b).toBe(15_410_000 + 12_000_000);
  });

  it("損益分岐年数は初期費用差 ÷ 年間費用差", () => {
    // 差 4,090,000円 ÷ 年 700,000円 = 5.842...年
    expect(breakEvenYear(base)).toBeCloseTo(4_090_000 / 700_000, 10);
  });

  it("期間内に交わらなければ null", () => {
    expect(breakEvenYear({ ...base, years: 3 })).toBeNull();
  });

  it("初期費用が高い側の年間費用も高ければ null(永久に追いつけない)", () => {
    expect(breakEvenYear({ ...base, annualYenA: 2_000_000 })).toBeNull();
  });

  it("年間費用が同じなら null", () => {
    expect(breakEvenYear({ ...base, annualYenA: 1_200_000 })).toBeNull();
  });
});
