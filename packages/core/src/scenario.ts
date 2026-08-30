import type { Powertrain, Vehicle } from "./vehicles";

/**
 * 診断シナリオの保存形式(F-6)。
 *
 * **選択時点の車両スペックを丸ごと控える。** 車両マスタ(D1)は管理画面で編集でき、
 * 診断バンドルもバッチで差し替わるため、IDだけを保存すると
 * 「補助金申請に添付した共有URLの数字が後から変わる」ことになる。
 * 共有シナリオは記録なので、後から動かないことを型で担保する。
 */
export interface ScenarioSide {
  vehicle: Vehicle;
  massKg: number;
  batteryKwh: number;
  priceYen: number;
  subsidyYen: number;
}

export interface ScenarioParams {
  /** 形式版。将来キーを増やすときに読み分ける */
  v: 1;
  routeId: string;
  /** 保存時に配信していた診断バンドルの版(R2のキー接頭辞) */
  bundleVersion: string;
  a: ScenarioSide;
  b: ScenarioSide;
  auxW: number;
  yenPerKwh: number;
  yenPerLiterDiesel: number;
  annualDays: number;
  tcoYears: number;
}

export type NormalizeResult =
  | { ok: true; value: ScenarioParams }
  | { ok: false; error: string };

/** params_json の上限。実測は約1.4KB(車両の出典文込み)なので十分な余裕がある */
export const SCENARIO_MAX_BYTES = 8 * 1024;

/** 比較画面のスライダー・入力欄と同じ値域。ここを緩めると画面と保存で前提がずれる */
const RANGES = {
  auxW: [0, 10000],
  yenPerKwh: [10, 60],
  yenPerLiterDiesel: [100, 250],
  annualDays: [1, 365],
  massKg: [5000, 16000],
  batteryKwh: [0, 300],
  money: [0, 1_000_000_000],
} as const;

const ROUTE_ID_RE = /^[A-Za-z0-9_]{1,80}$/;
const VEHICLE_ID_RE = /^[a-z0-9-]{1,40}$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;

function num(v: unknown, label: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${label} が数値ではありません`);
  if (v < min || v > max) throw new Error(`${label} は ${min}〜${max} の範囲で指定してください`);
  return v;
}

function str(v: unknown, label: string, maxLen: number): string {
  if (typeof v !== "string") throw new Error(`${label} が文字列ではありません`);
  if (v.length > maxLen) throw new Error(`${label} が長すぎます(${maxLen}文字まで)`);
  return v;
}

function optNum(v: unknown, label: string, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  return num(v, label, min, max);
}

function optUrl(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = str(v, label, 500);
  if (!/^https?:\/\//.test(s)) throw new Error(`${label} は http(s) のURLで指定してください`);
  return s;
}

function vehicle(v: unknown, label: string): Vehicle {
  if (typeof v !== "object" || v === null) throw new Error(`${label} がオブジェクトではありません`);
  const o = v as Record<string, unknown>;
  const id = str(o.id, `${label}.id`, 40);
  if (!VEHICLE_ID_RE.test(id)) throw new Error(`${label}.id の形式が不正です`);
  const powertrain = str(o.powertrain, `${label}.powertrain`, 10);
  if (powertrain !== "ev" && powertrain !== "diesel") {
    throw new Error(`${label}.powertrain は ev / diesel のいずれかです`);
  }
  return {
    id,
    name: str(o.name, `${label}.name`, 100),
    powertrain: powertrain as Powertrain,
    massKg: num(o.massKg, `${label}.massKg`, ...RANGES.massKg),
    batteryKwh: optNum(o.batteryKwh, `${label}.batteryKwh`, ...RANGES.batteryKwh),
    driveEff: optNum(o.driveEff, `${label}.driveEff`, 0, 1),
    regenEff: optNum(o.regenEff, `${label}.regenEff`, 0, 1),
    cda: num(o.cda, `${label}.cda`, 0, 20),
    crr: num(o.crr, `${label}.crr`, 0, 1),
    fuelKmPerL: optNum(o.fuelKmPerL, `${label}.fuelKmPerL`, 0, 100),
    priceYen: optNum(o.priceYen, `${label}.priceYen`, ...RANGES.money),
    subsidyYen: optNum(o.subsidyYen, `${label}.subsidyYen`, ...RANGES.money),
    sourceUrl: optUrl(o.sourceUrl, `${label}.sourceUrl`),
    note: str(o.note ?? "", `${label}.note`, 1000),
  };
}

function side(v: unknown, label: string): ScenarioSide {
  if (typeof v !== "object" || v === null) throw new Error(`${label} がオブジェクトではありません`);
  const o = v as Record<string, unknown>;
  return {
    vehicle: vehicle(o.vehicle, `${label}.vehicle`),
    massKg: num(o.massKg, `${label}.massKg`, ...RANGES.massKg),
    batteryKwh: num(o.batteryKwh, `${label}.batteryKwh`, ...RANGES.batteryKwh),
    priceYen: num(o.priceYen, `${label}.priceYen`, ...RANGES.money),
    subsidyYen: num(o.subsidyYen, `${label}.subsidyYen`, ...RANGES.money),
  };
}

/**
 * 受け取ったJSONを検証し、**既知のキーだけを詰め替えた**正規形を返す。
 *
 * 認証のない公開エンドポイントから呼ばれるので、入力をそのまま保存しない。
 * ホワイトリストで組み直すことで、未知のキーや巨大な文字列がD1に入らない。
 */
export function normalizeScenarioParams(input: unknown): NormalizeResult {
  try {
    if (typeof input !== "object" || input === null) {
      return { ok: false, error: "本文がオブジェクトではありません" };
    }
    const o = input as Record<string, unknown>;
    if (o.v !== 1) return { ok: false, error: "対応していない形式版です(v: 1 のみ)" };

    const routeId = str(o.routeId, "routeId", 80);
    if (!ROUTE_ID_RE.test(routeId)) return { ok: false, error: "routeId の形式が不正です" };
    const bundleVersion = str(o.bundleVersion, "bundleVersion", 64);
    if (!VERSION_RE.test(bundleVersion)) {
      return { ok: false, error: "bundleVersion の形式が不正です" };
    }

    const value: ScenarioParams = {
      v: 1,
      routeId,
      bundleVersion,
      a: side(o.a, "a"),
      b: side(o.b, "b"),
      auxW: num(o.auxW, "auxW", ...RANGES.auxW),
      yenPerKwh: num(o.yenPerKwh, "yenPerKwh", ...RANGES.yenPerKwh),
      yenPerLiterDiesel: num(o.yenPerLiterDiesel, "yenPerLiterDiesel", ...RANGES.yenPerLiterDiesel),
      annualDays: num(o.annualDays, "annualDays", ...RANGES.annualDays),
      // 評価期間は画面側の定数(TCO_YEARS)。任意の値を保存させない
      tcoYears: (() => {
        if (o.tcoYears !== 15) throw new Error("tcoYears は 15 のみ対応しています");
        return 15;
      })(),
    };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "検証に失敗しました" };
  }
}

/**
 * 共有IDの文字集合。Crockford Base32 から紛らわしい I / L / O / U を除いてある。
 * 印刷物から書き写される可能性があるため、読み違えにくい字だけにする。
 */
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 推測困難な共有ID(要件§5.3)。10バイト = 80ビットを16文字にする。
 * 連番にしない。crypto.getRandomValues はWorkersにもNodeにもある。
 */
export function generateScenarioId(): string {
  const bytes = new Uint8Array(10); // 80ビット
  crypto.getRandomValues(bytes);
  // 5ビットずつ切り出して1文字にする。80 / 5 = ちょうど16文字で、全文字が一様になる
  let acc = 0;
  let bits = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b; // フラッシュ後は bits < 5 なので acc は最大12ビット。桁あふれしない
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ID_ALPHABET[(acc >> bits) & 31];
    }
  }
  return out;
}

/** 共有IDとして受け付けられる形か(GETの前段で弾く) */
export function isScenarioId(v: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(v);
}
