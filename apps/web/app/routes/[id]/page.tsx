import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfile, getRoute, getThresholds, listRouteIds } from "@/lib/data";
import { formatInt } from "@/lib/format";
import { DiagnosisSheet } from "./_components/DiagnosisSheet";

/**
 * D1(路線メタ)とR2(プロファイル)から1路線分を取る。
 * 表示側は診断値を短い名前で使うので、ここで詰め替えて画面のコードは変えない。
 * gmaxは%表記に戻す(D1には分数で入っている)。
 */
async function load(id: string) {
  const route = await getRoute(id);
  if (!route) return null;
  const profile = await getProfile(route.bundleKey);
  if (!profile) return null;
  const row = {
    name: route.name,
    agency: route.agency,
    verdict: route.verdict,
    mode: route.accuracy,
    batt: route.roundtripBattPct,
    kwh: route.kwhPerKm,
    up: route.climbM,
    gmax: route.maxGrade * 100,
    daily: route.dailyKwh,
    charges: route.extraCharges,
    corr: route.correctedM,
    trips: route.tripsPerDay,
    // 力行・回生・最高最低標高はプロファイル側から取る
    Etr: profile.tractionKwh,
    regen: profile.regenKwh,
    emax: profile.emax,
    emin: profile.emin,
  };
  return { row, profile, schedule: profile.schedule };
}

/** 診断済みの46路線で固定。列挙外のIDは404にする(動的生成させない) */
export const dynamicParams = false;
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await listRouteIds()).map((id) => ({ id }));
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) return { title: "路線が見つかりません | Regen" };
  const { row } = data;
  return {
    title: `${row.name}(${row.agency})— EV化診断 ${row.verdict} | Regen`,
    description: `${row.name}のEV化適性診断。判定は「${row.verdict}」、冬季往復バッテリー使用率${row.batt}%、1日の必要電力量${formatInt(row.daily)}kWh、追加充電${row.charges}回。`,
  };
}

export default async function RoutePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) notFound();
  const { row, profile, schedule } = data;

  // 表示と再計算は DiagnosisSheet(Client)が行う。じぶん補正(F-4)を当てるため
  return (
    <DiagnosisSheet
      id={id}
      row={row}
      profile={profile}
      schedule={schedule}
      thresholds={await getThresholds()}
    />
  );
}
