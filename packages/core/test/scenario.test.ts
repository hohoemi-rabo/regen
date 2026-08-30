import { describe, it, expect } from "vitest";
import {
  SCENARIO_MAX_BYTES,
  findVehicle,
  generateScenarioId,
  isScenarioId,
  normalizeScenarioParams,
  type ScenarioParams,
} from "../src/index";

const evVehicle = findVehicle("byd-j6")!;
const dieselVehicle = findVehicle("hino-poncho")!;

function valid(): ScenarioParams {
  return {
    v: 1,
    routeId: "Minamishinshuseibu1_13",
    bundleVersion: "2026-08-29-prototype",
    a: { vehicle: evVehicle, massKg: 8500, batteryKwh: 125.7, priceYen: 19_500_000, subsidyYen: 5_000_000 },
    b: { vehicle: dieselVehicle, massKg: 8500, batteryKwh: 0, priceYen: 15_410_000, subsidyYen: 0 },
    auxW: 8000,
    yenPerKwh: 30,
    yenPerLiterDiesel: 165,
    annualDays: 250,
    tcoYears: 15,
  };
}

describe("normalizeScenarioParams", () => {
  it("正しい条件をそのまま通す", () => {
    const r = normalizeScenarioParams(valid());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(valid());
  });

  it("車両スペックを丸ごと保持する(マスタが変わっても再現できるようにするため)", () => {
    const r = normalizeScenarioParams(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.a.vehicle.batteryKwh).toBe(125.7);
    expect(r.value.a.vehicle.cda).toBe(evVehicle.cda);
    expect(r.value.a.vehicle.note).toBe(evVehicle.note);
    expect(r.value.b.vehicle.fuelKmPerL).toBe(dieselVehicle.fuelKmPerL);
  });

  it("未知のキーは保存されない(入力をそのまま持たない)", () => {
    const input = { ...valid(), evil: "x".repeat(5000), __proto__polluted: 1 } as unknown;
    const r = normalizeScenarioParams(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value).sort()).toEqual(
      ["a", "annualDays", "auxW", "b", "bundleVersion", "routeId", "tcoYears", "v", "yenPerKwh", "yenPerLiterDiesel"]
    );
    expect(JSON.stringify(r.value)).not.toContain("evil");
  });

  it("車両オブジェクトの未知のキーも落とす", () => {
    const p = valid();
    const r = normalizeScenarioParams({
      ...p,
      a: { ...p.a, vehicle: { ...p.a.vehicle, injected: "x".repeat(3000) } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.value)).not.toContain("injected");
  });

  it("正規化後のサイズが上限に十分収まる", () => {
    const r = normalizeScenarioParams(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bytes = new TextEncoder().encode(JSON.stringify(r.value)).length;
    expect(bytes).toBeLessThan(SCENARIO_MAX_BYTES);
    expect(bytes).toBeGreaterThan(500); // 出典文まで含んでいること
  });

  it.each([
    ["形式版が違う", { v: 2 }],
    ["routeIdが不正", { routeId: "../../etc/passwd" }],
    ["bundleVersionが不正", { bundleVersion: "a/b" }],
    ["空調が範囲外", { auxW: 99999 }],
    ["電力単価が範囲外", { yenPerKwh: 1 }],
    ["軽油単価が範囲外", { yenPerLiterDiesel: 9999 }],
    ["運行日数が範囲外", { annualDays: 400 }],
    ["評価期間が違う", { tcoYears: 30 }],
    ["空調が数値でない", { auxW: "8000" }],
    ["空調がNaN", { auxW: Number.NaN }],
  ])("%s → 拒否", (_label, patch) => {
    const r = normalizeScenarioParams({ ...valid(), ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it.each([
    ["重量が範囲外", { massKg: 100000 }],
    ["電池が範囲外", { batteryKwh: 5000 }],
    ["価格が負", { priceYen: -1 }],
  ])("車両A: %s → 拒否", (_label, patch) => {
    const p = valid();
    const r = normalizeScenarioParams({ ...p, a: { ...p.a, ...patch } });
    expect(r.ok).toBe(false);
  });

  it("powertrain が ev/diesel 以外なら拒否", () => {
    const p = valid();
    const r = normalizeScenarioParams({
      ...p, a: { ...p.a, vehicle: { ...p.a.vehicle, powertrain: "hydrogen" } },
    });
    expect(r.ok).toBe(false);
  });

  it("出典URLがhttp(s)でなければ拒否", () => {
    const p = valid();
    const r = normalizeScenarioParams({
      ...p, a: { ...p.a, vehicle: { ...p.a.vehicle, sourceUrl: "javascript:alert(1)" } },
    });
    expect(r.ok).toBe(false);
  });

  it("巨大な注記は拒否", () => {
    const p = valid();
    const r = normalizeScenarioParams({
      ...p, a: { ...p.a, vehicle: { ...p.a.vehicle, note: "あ".repeat(1001) } },
    });
    expect(r.ok).toBe(false);
  });

  it("オブジェクトでない入力・欠けた入力を拒否", () => {
    expect(normalizeScenarioParams(null).ok).toBe(false);
    expect(normalizeScenarioParams("x").ok).toBe(false);
    expect(normalizeScenarioParams({}).ok).toBe(false);
    expect(normalizeScenarioParams({ v: 1, routeId: "a" }).ok).toBe(false);
  });
});

describe("generateScenarioId", () => {
  it("16文字で、紛らわしい I/L/O/U を含まない", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateScenarioId();
      expect(id).toHaveLength(16);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(isScenarioId(id)).toBe(true);
    }
  });

  it("連番でなく重複しない", () => {
    const ids = new Set(Array.from({ length: 3000 }, generateScenarioId));
    expect(ids.size).toBe(3000);
  });

  it("全文字位置が一様に散る(先頭が固定値にならない)", () => {
    const heads = new Set(Array.from({ length: 500 }, () => generateScenarioId()[0]));
    expect(heads.size).toBeGreaterThan(10);
    const tails = new Set(Array.from({ length: 500 }, () => generateScenarioId()[15]));
    expect(tails.size).toBeGreaterThan(10);
  });

  it("isScenarioId は形の違うIDを弾く", () => {
    expect(isScenarioId("short")).toBe(false);
    expect(isScenarioId("0123456789ABCDEI")).toBe(false); // I は使わない
    expect(isScenarioId("0123456789abcdef")).toBe(false); // 小文字は使わない
    expect(isScenarioId("../../../../etc/p")).toBe(false);
  });
});
