import { DEFAULT_EV, PRICE, VehicleParams } from "./params";

export type Powertrain = "ev" | "diesel";

/**
 * 車両マスタ1件。列は D1 の vehicles テーブル(要件§6.1 / packages/db/src/schema.ts)に揃える。
 * チケット06でAPI取得(GET /api/vehicles)に差し替えるため、形を変えない。
 */
export interface Vehicle {
  id: string;
  name: string;
  powertrain: Powertrain;
  /** 走行時の想定車両総重量 [kg]。導出根拠は note に書く */
  massKg: number;
  /** EVのみ */
  batteryKwh: number | null;
  driveEff: number | null;
  regenEff: number | null;
  cda: number;
  crr: number;
  /** ディーゼルのみ [km/L] */
  fuelKmPerL: number | null;
  /** 税別 [円] */
  priceYen: number | null;
  subsidyYen: number | null;
  sourceUrl: string | null;
  /**
   * 公表値でない項目をどう埋めたかの注記。
   * 画面(F-3の「試算の仮定」)にそのまま出すので、推測は推測と分かる文言にする。
   */
  note: string;
}

/**
 * CdA・転がり抵抗・駆動効率・回生効率は**どのメーカーも公表していない**。
 * 全車で要件§9.2の既定値を流用し、その旨を note と画面で開示する。
 * ここを車種ごとに“それらしい”値で埋めると、根拠のない差が比較結果に出てしまう。
 */
const UNPUBLISHED = {
  cda: DEFAULT_EV.cda,
  crr: DEFAULT_EV.crr,
  driveEff: DEFAULT_EV.driveEff,
  regenEff: DEFAULT_EV.regenEff,
} as const;

const SPEC_NOTE =
  "CdA・転がり抵抗係数・駆動/回生効率はメーカー非公表のため、要件定義書§9.2の既定値" +
  "(CdA 5.0 / 転がり抵抗 0.008 / 駆動 85% / 回生 62%)を使用。";

/**
 * 初期車両マスタ(チケット05)。車種の確定は要件§13-1。
 * 06完了後は GET /api/vehicles に差し替えるが、型と id は維持する。
 */
export const VEHICLES: Vehicle[] = [
  {
    id: "standard-ev",
    name: "標準EVバス(小型・7m級)",
    powertrain: "ev",
    massKg: DEFAULT_EV.massKg,
    batteryKwh: DEFAULT_EV.batteryKwh,
    driveEff: DEFAULT_EV.driveEff,
    regenEff: DEFAULT_EV.regenEff,
    cda: DEFAULT_EV.cda,
    crr: DEFAULT_EV.crr,
    fuelKmPerL: null,
    priceYen: null,
    subsidyYen: null,
    sourceUrl: null,
    note:
      "要件定義書§9.2の既定値そのもの。路線診断書(F-2)と同じ前提の基準車なので、" +
      "この車両を選ぶと診断書と同じ数値になる。車両価格は車種によるため入力してください。",
  },
  {
    id: "byd-j6",
    name: "BYD J6(2.0)",
    powertrain: "ev",
    // 公表の車両重量7,925kg(都市型I)に想定乗車10名(550kg)を加えた値
    massKg: 8500,
    batteryKwh: 125.7,
    driveEff: UNPUBLISHED.driveEff,
    regenEff: UNPUBLISHED.regenEff,
    cda: UNPUBLISHED.cda,
    crr: UNPUBLISHED.crr,
    fuelKmPerL: null,
    // 2.0の価格は非公表。1.0(2019年発売時)の税別1,950万円を初期値として置く
    priceYen: 19_500_000,
    subsidyYen: null,
    sourceUrl: "https://ja.wikipedia.org/wiki/BYD%E3%83%BBJ6",
    note:
      "電池125.7kWh・全長6,990mmは公表値。重量は公表の車両重量7,925kg(都市型I)に" +
      "想定乗車10名(550kg)を加えた推定。価格は1.0(2019年発売時)の税別1,950万円で、" +
      "2.0の価格は非公表。" + SPEC_NOTE,
  },
  {
    id: "byd-j7",
    name: "BYD J7(中型・9m級)",
    powertrain: "ev",
    // 車両重量は非公表。9m級・定員61名の中型バスの車両総重量の代表値
    massKg: 13000,
    batteryKwh: 192.5,
    driveEff: UNPUBLISHED.driveEff,
    regenEff: UNPUBLISHED.regenEff,
    cda: UNPUBLISHED.cda,
    crr: UNPUBLISHED.crr,
    fuelKmPerL: null,
    priceYen: 36_500_000,
    subsidyYen: null,
    sourceUrl: "https://byd.co.jp/news/2025_0124_228.html",
    note:
      "電池192.5kWh・全長8,990mm・定員61名・税別3,650万円は公表値。" +
      "重量は非公表のため9m級中型バスの車両総重量の代表値13,000kgを置いた推定値です" +
      "(スライダーで実車の値に直してください)。" + SPEC_NOTE,
  },
  {
    id: "hino-poncho",
    name: "日野ポンチョ ロング(ディーゼル)",
    powertrain: "diesel",
    // EVとの比較を成立させるため、同クラスのJ6と同じ想定総重量に揃える
    massKg: 8500,
    batteryKwh: null,
    driveEff: null,
    regenEff: null,
    cda: UNPUBLISHED.cda,
    crr: UNPUBLISHED.crr,
    // 診断書のディーゼル比較(PRICE.dieselKmPerL)と同じ想定値
    fuelKmPerL: PRICE.dieselKmPerL,
    priceYen: 15_410_000,
    subsidyYen: null,
    sourceUrl: "https://www.hino.co.jp/poncho/",
    note:
      "全長7m・J05E(5.123L)・ロングボディ都市型の車両本体価格1,541万円は公表値。" +
      `燃費は公表されていないため、山岳路線を想定した${PRICE.dieselKmPerL} km/L` +
      "(診断書のディーゼル比較と同じ値)を使用。重量は同クラスのEVと揃えた想定値です。",
  },
];

export function findVehicle(id: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.id === id);
}

/**
 * 車両マスタ1件を診断エンジンの入力に変換する。
 * over で電池容量・車両重量だけを上書きできる(F-3のスライダー)。
 * ディーゼルは電池を持たないので batteryKwh は0になる — エネルギー計算には使わないこと。
 */
export function toVehicleParams(
  v: Vehicle,
  over?: { massKg?: number; batteryKwh?: number }
): VehicleParams {
  return {
    massKg: over?.massKg ?? v.massKg,
    cda: v.cda,
    crr: v.crr,
    driveEff: v.driveEff ?? DEFAULT_EV.driveEff,
    regenEff: v.regenEff ?? DEFAULT_EV.regenEff,
    batteryKwh: over?.batteryKwh ?? v.batteryKwh ?? 0,
    // D1のvehiclesに列がない。全車共通の既定値として扱い、画面で開示する(要件§9.2)
    usableRatio: DEFAULT_EV.usableRatio,
  };
}

// ---------------------------------------------------------------------------
// 管理画面からの書き込み(F-7-2)
// ---------------------------------------------------------------------------

export type VehicleNormalizeResult =
  | { ok: true; value: Vehicle & { isPublic: boolean } }
  | { ok: false; error: string };

/** 現実的な値域。ここを緩めると診断が壊れた車両で回ってしまう */
const VEHICLE_RANGES = {
  massKg: [1000, 40000],
  batteryKwh: [1, 1000],
  eff: [0.1, 1],
  cda: [0.5, 20],
  crr: [0.001, 0.05],
  fuelKmPerL: [0.1, 100],
  money: [0, 1_000_000_000],
} as const;

const VEHICLE_ID_RE = /^[a-z0-9-]{1,40}$/;

/**
 * 管理画面が送ってきた車両1件を正規形に詰め替える(F-7-2)。
 *
 * `normalizeScenarioParams` と同じ作法。**受け取ったJSONをそのまま保存しない。**
 * 認証済みの経路ではあるが、値域が壊れた車両は診断そのものを壊すので同じだけ検証する。
 */
export function normalizeVehicle(raw: unknown): VehicleNormalizeResult {
  try {
    if (typeof raw !== "object" || raw === null) throw new Error("車両がオブジェクトではありません");
    const o = raw as Record<string, unknown>;

    const str = (v: unknown, label: string, maxLen: number): string => {
      if (typeof v !== "string") throw new Error(`${label} が文字列ではありません`);
      const t = v.trim();
      if (t === "") throw new Error(`${label} を入力してください`);
      if (t.length > maxLen) throw new Error(`${label} が長すぎます(${maxLen}文字まで)`);
      return t;
    };
    const num = (v: unknown, label: string, r: readonly [number, number]): number => {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} が数値ではありません`);
      if (v < r[0] || v > r[1]) throw new Error(`${label} は ${r[0]}〜${r[1]} の範囲で入力してください`);
      return v;
    };
    const optNum = (v: unknown, label: string, r: readonly [number, number]): number | null =>
      v === null || v === undefined || v === "" ? null : num(v, label, r);
    const optStr = (v: unknown, label: string, maxLen: number): string | null =>
      v === null || v === undefined || v === "" ? null : str(v, label, maxLen);

    const id = str(o.id, "ID", 40);
    if (!VEHICLE_ID_RE.test(id)) {
      throw new Error("ID は英小文字・数字・ハイフンのみで指定してください");
    }
    if (o.powertrain !== "ev" && o.powertrain !== "diesel") {
      throw new Error("動力は ev / diesel のいずれかです");
    }
    const powertrain: Powertrain = o.powertrain;

    const url = optStr(o.sourceUrl, "出典URL", 500);
    if (url !== null && !/^https?:\/\//.test(url)) {
      throw new Error("出典URL は http(s) で始めてください");
    }

    const value = {
      id,
      name: str(o.name, "車種名", 100),
      powertrain,
      massKg: num(o.massKg, "車両総重量", VEHICLE_RANGES.massKg),
      batteryKwh: optNum(o.batteryKwh, "電池容量", VEHICLE_RANGES.batteryKwh),
      driveEff: optNum(o.driveEff, "駆動効率", VEHICLE_RANGES.eff),
      regenEff: optNum(o.regenEff, "回生効率", VEHICLE_RANGES.eff),
      cda: num(o.cda, "CdA", VEHICLE_RANGES.cda),
      crr: num(o.crr, "転がり抵抗係数", VEHICLE_RANGES.crr),
      fuelKmPerL: optNum(o.fuelKmPerL, "燃費", VEHICLE_RANGES.fuelKmPerL),
      priceYen: optNum(o.priceYen, "車両価格", VEHICLE_RANGES.money),
      subsidyYen: optNum(o.subsidyYen, "補助金", VEHICLE_RANGES.money),
      sourceUrl: url,
      note: optStr(o.note, "注記", 2000) ?? "",
      isPublic: o.isPublic !== false,
    };

    // 動力ごとに要る値。欠けたまま保存すると比較画面で0除算やnull扱いが出る
    if (value.powertrain === "ev" && value.batteryKwh === null) {
      throw new Error("EVは電池容量が要ります");
    }
    if (value.powertrain === "diesel" && value.fuelKmPerL === null) {
      throw new Error("ディーゼルは燃費(km/L)が要ります");
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "車両を読み取れません" };
  }
}
