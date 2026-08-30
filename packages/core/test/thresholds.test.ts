import { describe, it, expect } from "vitest";
import {
  DEFAULT_THRESHOLDS, THRESHOLD_RANGES, FEED_EXPIRY_WARN_DAYS,
  daysUntil, isDefaultThresholds, judge, normalizeThresholds, normalizeVehicle,
} from "../src/index";

describe("判定しきい値(F-7-4)", () => {
  describe("既定値", () => {
    it("要件§5の初期値そのもの(変えると46路線の判定が動く)", () => {
      expect(DEFAULT_THRESHOLDS).toEqual({ fitBattPct: 60, condBattPct: 85, fitMaxGrade: 0.1 });
    });

    it("しきい値を省略した judge() は移植時と同じ判定を返す", () => {
      expect(judge(59, 0.099)).toBe("適");
      expect(judge(60, 0.05)).toBe("条件付き");   // 電池が上限ちょうど
      expect(judge(59, 0.1)).toBe("条件付き");    // 勾配が上限ちょうど
      expect(judge(84, 0.05)).toBe("条件付き");
      expect(judge(85, 0.05)).toBe("要検討");
    });

    it("しきい値を渡しても既定値なら結果が変わらない", () => {
      for (const [b, g] of [[59, 0.099], [60, 0.05], [59, 0.1], [84, 0.2], [85, 0.05]] as const) {
        expect(judge(b, g, DEFAULT_THRESHOLDS)).toBe(judge(b, g));
      }
    });
  });

  describe("しきい値を動かす", () => {
    it("勾配のしきいを上げると 条件付き が 適 になる", () => {
      const th = { ...DEFAULT_THRESHOLDS, fitMaxGrade: 0.12 };
      expect(judge(59, 0.106)).toBe("条件付き");
      expect(judge(59, 0.106, th)).toBe("適");
    });

    it("電池のしきいを下げると 適 が 条件付き になる", () => {
      const th = { ...DEFAULT_THRESHOLDS, fitBattPct: 40 };
      expect(judge(43, 0.05)).toBe("適");
      expect(judge(43, 0.05, th)).toBe("条件付き");
    });

    it("条件付きの上限を下げると 要検討 が出る", () => {
      const th = { ...DEFAULT_THRESHOLDS, condBattPct: 70 };
      expect(judge(74, 0.05)).toBe("条件付き");
      expect(judge(74, 0.05, th)).toBe("要検討");
    });
  });

  describe("isDefaultThresholds", () => {
    it("既定と一致するときだけ true", () => {
      expect(isDefaultThresholds(DEFAULT_THRESHOLDS)).toBe(true);
      expect(isDefaultThresholds({ ...DEFAULT_THRESHOLDS })).toBe(true);
      expect(isDefaultThresholds({ ...DEFAULT_THRESHOLDS, fitMaxGrade: 0.12 })).toBe(false);
    });
  });

  describe("保存値の検証(管理画面から書かれるので信用しない)", () => {
    it("正しい形は通る", () => {
      expect(normalizeThresholds({ fitBattPct: 55, condBattPct: 80, fitMaxGrade: 0.12 }))
        .toEqual({ fitBattPct: 55, condBattPct: 80, fitMaxGrade: 0.12 });
    });

    it("余計なキーは落とす", () => {
      expect(normalizeThresholds({ ...DEFAULT_THRESHOLDS, evil: 1 })).toEqual(DEFAULT_THRESHOLDS);
    });

    it("適の上限が条件付きの上限を超える組み合わせは弾く(条件付きが消える)", () => {
      expect(normalizeThresholds({ fitBattPct: 90, condBattPct: 80, fitMaxGrade: 0.1 })).toBeNull();
    });

    it("値域外・型違いは null", () => {
      for (const bad of [
        null, undefined, 1, "x", [],
        { fitBattPct: 0, condBattPct: 85, fitMaxGrade: 0.1 },
        { fitBattPct: 60, condBattPct: 85, fitMaxGrade: 10 },     // %で入れた取り違え
        { fitBattPct: 60, condBattPct: 85, fitMaxGrade: 0.001 },
        { fitBattPct: Number.NaN, condBattPct: 85, fitMaxGrade: 0.1 },
        { fitBattPct: 60, condBattPct: 85 },
      ]) {
        expect(normalizeThresholds(bad), JSON.stringify(bad)).toBeNull();
      }
      expect(THRESHOLD_RANGES.fitMaxGrade[1]).toBeLessThan(1); // 分数であることの歯止め
    });
  });
});

describe("フィード期限(F-8-5)", () => {
  const now = Date.parse("2026-08-30T00:00:00Z");
  it("残り日数を出す", () => {
    expect(daysUntil("2026-09-09", now)).toBe(10);
    expect(daysUntil("2026-08-30", now)).toBe(0);
    expect(daysUntil("2026-08-20", now)).toBe(-10);
  });
  it("期限が無い・壊れているときは null", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("", now)).toBeNull();
    expect(daysUntil("いつか", now)).toBeNull();
  });
  it("警告日数はバッチと画面で共有する", () => {
    expect(FEED_EXPIRY_WARN_DAYS).toBe(60);
  });
});

describe("車両マスタの検証(F-7-2)", () => {
  const ok = {
    id: "test-ev", name: "テストEV", powertrain: "ev", massKg: 8500, batteryKwh: 105,
    driveEff: 0.85, regenEff: 0.62, cda: 5, crr: 0.008, fuelKmPerL: null,
    priceYen: 20000000, subsidyYen: null, sourceUrl: "https://example.com", note: "",
  };

  it("正しい車両は通り、isPublic は既定で true", () => {
    const r = normalizeVehicle(ok);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("test-ev");
      expect(r.value.isPublic).toBe(true);
      expect(r.value.batteryKwh).toBe(105);
    }
  });

  it("余計なキーは落とす", () => {
    const r = normalizeVehicle({ ...ok, evil: "x", isPublic: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("evil" in r.value).toBe(false);
      expect(r.value.isPublic).toBe(false);
    }
  });

  it("空欄はnullとして保存できる(ディーゼルの電池容量など)", () => {
    const r = normalizeVehicle({
      ...ok, id: "test-d", powertrain: "diesel", batteryKwh: "", driveEff: null,
      regenEff: null, fuelKmPerL: 2.5, priceYen: "", sourceUrl: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.batteryKwh).toBeNull();
      expect(r.value.priceYen).toBeNull();
      expect(r.value.sourceUrl).toBeNull();
    }
  });

  it("動力ごとの必須値が欠けていれば理由つきで弾く", () => {
    expect(normalizeVehicle({ ...ok, batteryKwh: null })).toMatchObject({ ok: false });
    expect(normalizeVehicle({ ...ok, id: "d", powertrain: "diesel", fuelKmPerL: null }))
      .toMatchObject({ ok: false });
  });

  it("壊れた入力は日本語の理由を返す", () => {
    const cases: [unknown, RegExp][] = [
      [{ ...ok, id: "Bad ID" }, /ID/],
      [{ ...ok, name: "" }, /車種名/],
      [{ ...ok, powertrain: "hybrid" }, /動力/],
      [{ ...ok, massKg: 0 }, /車両総重量/],
      [{ ...ok, crr: 5 }, /転がり抵抗/],
      [{ ...ok, sourceUrl: "javascript:alert(1)" }, /出典URL/],
      [null, /./],
    ];
    for (const [input, re] of cases) {
      const r = normalizeVehicle(input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
  });
});
