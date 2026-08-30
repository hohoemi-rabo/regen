import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isScenarioId } from "@regen/core";
import { getProfile, getRoute, getScenario } from "@/lib/data";
import { ScenarioSheet } from "./_components/ScenarioSheet";

/**
 * 共有シナリオは作られた後は変わらない。IDは実行時に生えるので
 * generateStaticParams は使わず、初回アクセス時に生成してキャッシュする。
 */
export const revalidate = 86400;

async function load(id: string) {
  if (!isScenarioId(id)) return null;
  const scenario = await getScenario(id);
  if (!scenario) return null;
  const route = await getRoute(scenario.params.routeId);
  if (!route) return null;
  // 標高は保存時のバンドル版から取る(路線メタが更新されても保存時の形状で再現する)
  const key = `bundles/${scenario.params.bundleVersion}/profile/${scenario.params.routeId}.json`;
  const profile = (await getProfile(key)) ?? (await getProfile(route.bundleKey));
  if (!profile) return null;
  return { scenario, route, profile };
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const data = await load(id);
  // 共有URLは検索エンジンに載せない(要件§5.3)
  const robots = { index: false, follow: false };
  if (!data) return { title: "シナリオが見つかりません | Regen", robots };
  const { route, scenario } = data;
  return {
    title: `${route.name}(${route.agency})— 共有シナリオ | Regen`,
    description: `${route.name}を ${scenario.params.a.vehicle.name} と ${scenario.params.b.vehicle.name} で比較した試算結果。判定は「${route.verdict}」。`,
    robots,
  };
}

export default async function ScenarioPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) notFound();
  const { scenario, route, profile } = data;

  return (
    <ScenarioSheet
      id={scenario.id}
      params={scenario.params}
      createdAt={scenario.createdAt}
      routeName={route.name}
      agency={route.agency}
      lengthM={profile.lengthM}
      repDayLabel={profile.schedule.repDayLabel}
      repTrips={profile.schedule.repTrips}
      elev25={profile.elev25}
      gmax={route.maxGrade}
      arrivals={profile.schedule.trips.map((t) => t.arr)}
    />
  );
}
