import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, eq } from "drizzle-orm";
import { agencies, bundles, feeds, routes, vehicles } from "@regen/db";

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
