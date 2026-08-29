import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diagnose, DiagnoseInput } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "fixtures", "golden.json"), "utf-8"));

function close(a: number, b: number, label: string) {
  const tol = 1e-6 * (1 + Math.abs(b));
  expect(Math.abs(a - b), label + ": got " + a + " want " + b).toBeLessThanOrEqual(tol);
}

describe("ゴールデンテスト: 南信州46路線(2026-08-29 Python版の結果と一致すること)", () => {
  for (const r of fx.routes) {
    it(r.agency + " " + r.name + " [" + r.mode + "]", () => {
      const input: DiagnoseInput = {
        elev: r.elev, gap: r.gap, mode: r.mode, anchors: r.anchors, trips: r.trips,
      };
      const d = diagnose(input);
      const e = r.expected;
      close(d.up, e.up, "累積上り");
      close(d.dn, e.dn, "累積下り");
      close(d.gmax, e.gmax, "最急勾配");
      close(d.gmin, e.gmin, "最急降坂");
      close(d.tractionKwh, e.etr, "力行");
      close(d.regenKwh, e.ereg, "回生");
      close(d.eSummerKwh, e.eSummer, "夏電力");
      close(d.eWinterKwh, e.eWinter, "冬電力");
      close(d.kwhPerKm, e.kwhPerKm, "電費");
      close(d.roundtripBattPct, e.battPct, "往復電池%");
      close(d.correctedM, e.correctedM, "補正延長");
      close(d.emin, e.emin, "最低標高");
      close(d.emax, e.emax, "最高標高");
      close(d.dailyKwh, e.daily, "日次電力");
      expect(d.extraCharges, "追加充電回数").toBe(e.charges);
      expect(d.verdict, "判定").toBe(e.verdict);
    });
  }

  it("全体集計: 適34 / 条件付き12 / 要検討0", () => {
    const counts: Record<string, number> = {};
    for (const r of fx.routes) {
      const d = diagnose({ elev: r.elev, gap: r.gap, mode: r.mode, anchors: r.anchors, trips: r.trips });
      counts[d.verdict] = (counts[d.verdict] ?? 0) + 1;
    }
    expect(counts["適"]).toBe(34);
    expect(counts["条件付き"]).toBe(12);
    expect(counts["要検討"] ?? 0).toBe(0);
  });
});
