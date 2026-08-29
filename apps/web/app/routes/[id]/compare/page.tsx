import type { Metadata } from "next";
import { notFound } from "next/navigation";
import summary from "@/data/routes_summary.json";
import profiles from "@/data/profiles.json";
import profiles25 from "@/data/profiles25.json";
import schedules from "@/data/schedules.json";
import { CompareScreen } from "./_components/CompareScreen";

type Row = (typeof summary)[number];
type Profile = (typeof profiles)[keyof typeof profiles];
type Schedule = (typeof schedules)[keyof typeof schedules];

function load(id: string) {
  const row = (summary as Row[]).find((r) => r.id === id);
  const profile = (profiles as Record<string, Profile>)[id];
  const schedule = (schedules as Record<string, Schedule>)[id];
  const elev25 = (profiles25 as Record<string, number[]>)[id];
  if (!row || !profile || !schedule || !elev25) return null;
  return { row, profile, schedule, elev25 };
}

/** 診断済みの46路線で固定。列挙外のIDは404にする(動的生成させない) */
export const dynamicParams = false;

export function generateStaticParams() {
  return (summary as Row[]).map((r) => ({ id: r.id }));
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const data = load(id);
  if (!data) return { title: "路線が見つかりません | Regen" };
  const { row } = data;
  return {
    title: `${row.name}(${row.agency})— 車両比較 | Regen`,
    description: `${row.name}で車種・電池容量・車両重量・空調・単価を変えたときのEV化診断とTCO(損益分岐年数)をブラウザ内で再計算します。`,
  };
}

export default async function ComparePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = load(id);
  if (!data) notFound();
  const { row, profile, schedule, elev25 } = data;

  return (
    <CompareScreen
      routeId={id}
      routeName={row.name}
      agency={row.agency}
      // 1路線分の25m配列(最大2,226点)だけを渡す。全路線分は渡さない
      elev25={elev25}
      lengthM={profile.lengthM}
      // routes_summary の gmax は%表記。judge() は分数で比較するのでここで変換する
      gmax={row.gmax / 100}
      tripsPerDay={schedule.repTrips}
      repDayLabel={schedule.repDayLabel}
      repTrips={schedule.repTrips}
      totalTrips={schedule.totalTrips}
      arrivals={schedule.trips.map((t) => t.arr)}
    />
  );
}
