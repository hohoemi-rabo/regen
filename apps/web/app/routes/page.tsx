import type { Metadata } from "next";
import summary from "@/data/routes_summary.json";
import { RouteListScreen, type RouteRow } from "./_components/RouteListScreen";

export const metadata: Metadata = {
  title: "路線一覧 | Regen",
  description:
    "南信州46路線のEV化診断値を一覧表示。判定・距離・勾配・電費・往復バッテリー使用率・日次電力量で並べ替え、CSVでダウンロードできます。",
};

export default function RoutesPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <h1 className="text-page-title">路線一覧</h1>
      <p className="mt-1 text-body text-ink-2">
        全{summary.length}路線の診断値。列見出しで並べ替えできます。地図は
        <a href="/" className="text-accent hover:text-accent-strong">
          EV適性マップ
        </a>
        へ。
      </p>
      <div className="mt-5">
        <RouteListScreen rows={summary as RouteRow[]} />
      </div>
    </main>
  );
}
