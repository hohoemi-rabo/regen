import { DATA_GENERATED_AT } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-5 text-note text-ink-3">
        <p>
          出典: 地理院タイル(国土地理院) / GTFSデータリポジトリ(gtfs-data.jp)南信州11フィード
        </p>
        <p className="mt-1">
          診断データ生成日: {DATA_GENERATED_AT}。本診断はオープンデータに基づく一次診断であり、実測補正で精度が向上します。
        </p>
      </div>
    </footer>
  );
}
