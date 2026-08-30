import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfile, getRoute, listRouteIds, listVehicles } from "@/lib/data";
import { CompareScreen } from "./_components/CompareScreen";

async function load(id: string) {
  const route = await getRoute(id);
  if (!route) return null;
  const profile = await getProfile(route.bundleKey);
  if (!profile) return null;
  return { route, profile, schedule: profile.schedule };
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
  const { route } = data;
  return {
    title: `${route.name}(${route.agency})— 車両比較 | Regen`,
    description: `${route.name}で車種・電池容量・車両重量・空調・単価を変えたときのEV化診断とTCO(損益分岐年数)をブラウザ内で再計算します。`,
  };
}

export default async function ComparePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) notFound();
  const { route, profile, schedule } = data;
  // 車両マスタはD1が正本(チケット06以降)。Clientにはシリアライズ可能な値だけを渡す
  const vehicles = await listVehicles();

  return (
    <CompareScreen
      routeId={id}
      routeName={route.name}
      agency={route.agency}
      vehicles={vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        powertrain: v.powertrain as "ev" | "diesel",
        massKg: v.massKg,
        batteryKwh: v.batteryKwh,
        driveEff: v.driveEff,
        regenEff: v.regenEff,
        cda: v.cda,
        crr: v.crr,
        fuelKmPerL: v.fuelKmPerL,
        priceYen: v.priceYen,
        subsidyYen: v.subsidyYen,
        sourceUrl: v.sourceUrl,
        note: v.note ?? "",
      }))}
      // 1路線分の25m配列(最大2,226点)だけを渡す。全路線分は渡さない
      elev25={profile.elev25}
      lengthM={profile.lengthM}
      // D1の max_grade は分数。judge() と同じ単位なのでそのまま渡す
      gmax={route.maxGrade}
      tripsPerDay={schedule.repTrips}
      repDayLabel={schedule.repDayLabel}
      repTrips={schedule.repTrips}
      totalTrips={schedule.totalTrips}
      arrivals={schedule.trips.map((t) => t.arr)}
    />
  );
}
