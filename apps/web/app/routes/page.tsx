import type { Metadata } from "next";
import { listRoutes } from "@/lib/data";
import { RouteListScreen, type RouteRow } from "./_components/RouteListScreen";

export const metadata: Metadata = {
  title: "路線一覧 | Regen",
  description:
    "南信州46路線のEV化診断値を一覧表示。判定・距離・勾配・電費・往復バッテリー使用率・日次電力量で並べ替え、CSVでダウンロードできます。",
};

/** 診断値はバッチ更新のとき以外変わらない */
export const revalidate = 3600;

export default async function RoutesPage() {
  const routes = await listRoutes();
  // 表示用の短い列名に詰め替える。gmaxは%表記・Lはkmが表の単位(D1は分数とメートル)
  const rows: RouteRow[] = routes.map((r) => ({
    id: r.id,
    name: r.name,
    agency: r.agency,
    verdict: r.verdict,
    batt: r.roundtripBattPct,
    kwh: r.kwhPerKm,
    L: r.lengthM / 1000,
    up: r.climbM,
    gmax: r.maxGrade * 100,
    mode: r.accuracy,
    trips: r.tripsPerDay,
    daily: r.dailyKwh,
    charges: r.extraCharges,
    etr: r.tractionKwh,
    regen: r.regenKwh,
    ew: r.kwhPerKm * (r.lengthM / 1000),
    // D1の max_grade は分数。judge() と同じ単位なのでそのまま渡す
    mg: r.maxGrade,
  }));

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <h1 className="text-page-title">路線一覧</h1>
      <p className="mt-1 text-body text-ink-2">
        全{rows.length}路線の診断値。列見出しで並べ替えできます。地図は
        <a href="/" className="text-accent hover:text-accent-strong">
          EV適性マップ
        </a>
        へ。
      </p>
      <div className="mt-5">
        <RouteListScreen rows={rows} />
      </div>
    </main>
  );
}
