import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq } from "drizzle-orm";
import { agencies, batchRuns, bundles, feeds, routes, scenarios, settings, vehicles } from "@regen/db";
import {
  DEFAULT_THRESHOLDS, generateScenarioId, judge, normalizeThresholds,
  type ScenarioParams, type Thresholds, type Vehicle,
} from "@regen/core";

/**
 * D1 / R2 への唯一の入口。
 *
 * ここ以外から getCloudflareContext() を呼ばない。`import "server-only"` を付けてあるので、
 * クライアントコンポーネントから誤importするとビルドで落ちる(CLAUDE.md Server/Client境界)。
 *
 * **必ず async 版の getCloudflareContext を使う。** 46路線を generateStaticParams で
 * 全件プリレンダリングしており、静的生成コンテキストでは同期版が throw する。
 */
async function env() {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

async function db() {
  return drizzle((await env()).DB);
}

export type Verdict = "適" | "条件付き" | "要検討";
export type Accuracy = "A" | "B";

/** 画面が使う路線1件。D1の routes + agencies の join 結果 */
export interface RouteRecord {
  id: string;
  name: string;
  agency: string;
  verdict: string;
  accuracy: Accuracy;
  lengthM: number;
  tripsPerDay: number;
  climbM: number;
  /** 分数(0.106 = 10.6%)。D1には分数で入っている */
  maxGrade: number;
  kwhPerKm: number;
  /** 力行・回生 [kWh/片道]。実測補正(F-4)を一覧・マップで当てるのに使う */
  tractionKwh: number;
  regenKwh: number;
  roundtripBattPct: number;
  dailyKwh: number;
  extraCharges: number;
  correctedM: number;
  bundleKey: string;
}

const selectRoute = {
  id: routes.id,
  name: routes.name,
  agency: agencies.name,
  verdict: routes.verdict,
  accuracy: routes.accuracy,
  lengthM: routes.lengthM,
  tripsPerDay: routes.tripsPerDay,
  climbM: routes.climbM,
  maxGrade: routes.maxGrade,
  kwhPerKm: routes.kwhPerKm,
  tractionKwh: routes.tractionKwh,
  regenKwh: routes.regenKwh,
  roundtripBattPct: routes.roundtripBattPct,
  dailyKwh: routes.dailyKwh,
  extraCharges: routes.extraCharges,
  correctedM: routes.correctedM,
  bundleKey: routes.bundleKey,
};

export async function listRoutes(filter?: {
  verdict?: string;
  agency?: string;
}): Promise<RouteRecord[]> {
  const where = [
    filter?.verdict ? eq(routes.verdict, filter.verdict) : undefined,
    filter?.agency ? eq(agencies.name, filter.agency) : undefined,
  ].filter(Boolean);
  const q = (await db())
    .select(selectRoute)
    .from(routes)
    .innerJoin(agencies, eq(routes.agencyId, agencies.id))
    .orderBy(asc(routes.id));
  const rows = where.length ? await q.where(and(...where)) : await q;
  return rows as RouteRecord[];
}

export async function getRoute(id: string): Promise<RouteRecord | null> {
  const rows = await (await db())
    .select(selectRoute)
    .from(routes)
    .innerJoin(agencies, eq(routes.agencyId, agencies.id))
    .where(eq(routes.id, id))
    .limit(1);
  return (rows[0] as RouteRecord) ?? null;
}

/** プリレンダリング対象の路線ID(generateStaticParams から呼ぶ) */
export async function listRouteIds(): Promise<string[]> {
  const rows = await (await db()).select({ id: routes.id }).from(routes).orderBy(asc(routes.id));
  return rows.map((r) => r.id);
}

/** R2に置いた1路線分のプロファイル。診断書と比較画面はこれ1つで足りる */
export interface RouteProfile {
  /** 表示用に間引いた標高 [m] */
  elev: number[];
  stepM: number;
  lengthM: number;
  dn: number;
  corrSegments: { startM: number; endM: number; maxCutM: number }[];
  firstStop: string;
  lastStop: string;
  peakIdx: number;
  eSummerKwh: number;
  eWinterKwh: number;
  /** 25m間隔の補正後標高。F-3のブラウザ内再計算はこれを使う(間引いた elev では診断書と食い違う) */
  elev25: number[];
  emax: number;
  emin: number;
  tractionKwh: number;
  regenKwh: number;
  schedule: {
    repDayLabel: string;
    repTrips: number;
    totalTrips: number;
    breakdown: { label: string; trips: number }[];
    trips: { dep: string; arr: string }[];
  };
}

/** R2からプロファイルを取る。キーは routes.bundle_key(版を含む) */
export async function getProfile(bundleKey: string): Promise<RouteProfile | null> {
  const obj = await (await env()).BUNDLES.get(bundleKey);
  if (!obj) return null;
  return (await obj.json()) as RouteProfile;
}

/** 車両マスタ。公開行のみ(管理画面が非公開行を作れるようにしてある) */
export async function listVehicles() {
  return (await db())
    .select()
    .from(vehicles)
    .where(eq(vehicles.isPublic, 1))
    .orderBy(asc(vehicles.id));
}

/** 現在配信中のバンドル版。R2のキー接頭辞と生成日時の正本 */
export async function getCurrentBundle() {
  const rows = await (await db())
    .select()
    .from(bundles)
    .where(eq(bundles.isCurrent, 1))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFeeds() {
  return (await db()).select().from(feeds).orderBy(asc(feeds.id));
}

/** マップ用GeoJSON(全路線サマリー+ポリライン)。R2の routes.json をそのまま返す */
export async function getRoutesGeoJson(version: string): Promise<R2ObjectBody | null> {
  return (await env()).BUNDLES.get(`bundles/${version}/routes.json`);
}

// ---------------------------------------------------------------------------
// 診断シナリオ(F-6)。**リポジトリで唯一の書き込み経路**
// ---------------------------------------------------------------------------

export interface ScenarioRecord {
  id: string;
  routeId: string;
  params: ScenarioParams;
  /** 保存日時(ミリ秒)。bundles.created_at と単位を揃えてある */
  createdAt: number;
}

/**
 * 条件を保存して共有IDを返す。
 * params は normalizeScenarioParams を通した正規形だけを渡すこと
 * (呼び出し側で検証済み。ここでは再検証しない)。
 * expires_at は null = 無期限。補助金申請に添付したURLが後から切れないようにする。
 */
export async function createScenario(params: ScenarioParams): Promise<string> {
  const id = generateScenarioId();
  await (await db()).insert(scenarios).values({
    id,
    routeId: params.routeId,
    paramsJson: JSON.stringify(params),
    createdAt: Date.now(),
    expiresAt: null,
  });
  return id;
}

export async function getScenario(id: string): Promise<ScenarioRecord | null> {
  const rows = await (await db())
    .select()
    .from(scenarios)
    .where(eq(scenarios.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    routeId: row.routeId,
    params: JSON.parse(row.paramsJson) as ScenarioParams,
    createdAt: row.createdAt,
  };
}

/**
 * 公開書き込み口のレート制限(要件§7)。true なら通してよい。
 * Cloudflareのレート制限はコロ単位・結果整合の緩い制限で、正確な計数用ではない。
 * 濫用抑止が目的なので、判定できない場合は通す(可用性を優先)。
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  const limiter = (await env()).SCENARIO_LIMITER;
  if (!limiter) return true; // バインディング未設定の環境では素通し
  const { success } = await limiter.limit({ key });
  return success;
}

// ---------------------------------------------------------------------------
// 管理画面(F-7)。requireAdmin / requireAdminApi を通った先でのみ呼ぶ
// ---------------------------------------------------------------------------

/** バッチ実行履歴(F-7-3)。新しい順 */
export async function listBatchRuns(limit = 20) {
  return (await db()).select().from(batchRuns).orderBy(desc(batchRuns.id)).limit(limit);
}

/** 車両マスタ全件。**非公開行も返す**(管理画面専用) */
export async function listAllVehicles() {
  return (await db()).select().from(vehicles).orderBy(asc(vehicles.id));
}

export type VehicleInput = Vehicle & { isPublic: boolean };

/** 追加または更新(F-7-2)。normalizeVehicle を通した値だけを渡すこと */
export async function upsertVehicle(v: VehicleInput): Promise<void> {
  const row = {
    id: v.id, name: v.name, powertrain: v.powertrain, massKg: v.massKg,
    batteryKwh: v.batteryKwh, driveEff: v.driveEff, regenEff: v.regenEff,
    cda: v.cda, crr: v.crr, fuelKmPerL: v.fuelKmPerL, priceYen: v.priceYen,
    subsidyYen: v.subsidyYen, sourceUrl: v.sourceUrl, note: v.note,
    isPublic: v.isPublic ? 1 : 0,
  };
  await (await db()).insert(vehicles).values(row).onConflictDoUpdate({ target: vehicles.id, set: row });
}

const THRESHOLDS_KEY = "thresholds";

/**
 * 判定しきい値(F-7-4)。未設定・壊れていれば要件§5の初期値。
 * **保存値は画面から書かれるので、読み出しのたびに normalize を通す。**
 */
export async function getThresholds(): Promise<Thresholds> {
  const rows = await (await db())
    .select().from(settings).where(eq(settings.key, THRESHOLDS_KEY)).limit(1);
  if (!rows[0]) return DEFAULT_THRESHOLDS;
  try {
    return normalizeThresholds(JSON.parse(rows[0].value)) ?? DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

async function verdictInputs() {
  return (await db())
    .select({
      id: routes.id,
      batt: routes.roundtripBattPct,
      grade: routes.maxGrade,
      verdict: routes.verdict,
    })
    .from(routes);
}

/** しきい値に合わせて routes.verdict を書き直す。変えた行数を返す */
async function applyVerdicts(th: Thresholds): Promise<number> {
  const d = await db();
  const rows = await verdictInputs();
  let changed = 0;
  for (const r of rows) {
    // max_grade は**分数**。%へ丸めた値から戻さない(9.95%が10%になると判定が変わる)
    const next = judge(r.batt, r.grade, th);
    if (next === r.verdict) continue;
    await d.update(routes).set({ verdict: next }).where(eq(routes.id, r.id));
    changed++;
  }
  return changed;
}

/** 保存せずに「何路線の判定が変わるか」だけ数える(保存前の確認に使う) */
export async function countVerdictChanges(th: Thresholds): Promise<number> {
  const rows = await verdictInputs();
  return rows.filter((r) => judge(r.batt, r.grade, th) !== r.verdict).length;
}

/**
 * しきい値を保存し、**その場でD1の判定を付け替える**(即時反映)。
 * 判定の定義を SQL に書き写さず、46行を読んで judge() で計算し直す
 * (定義が2か所にあると、片方だけ直したときに黙ってずれる)。
 * @returns 判定が変わった路線数
 */
export async function saveThresholds(th: Thresholds, updatedBy: string | null): Promise<number> {
  const value = JSON.stringify(th);
  const now = Date.now();
  await (await db())
    .insert(settings)
    .values({ key: THRESHOLDS_KEY, value, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now, updatedBy } });
  return applyVerdicts(th);
}
