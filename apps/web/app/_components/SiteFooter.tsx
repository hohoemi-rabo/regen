import { getCurrentBundle } from "@/lib/data";

/** ミリ秒 → JSTの YYYY-MM-DD。WorkersはUTCなので9時間足してから切る */
function jstDate(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 生成日と収録フィード数は D1 の `bundles`(is_current)が正本。
 * バッチが版を発行するので、ここに日付を書き置かない。
 *
 * ルートレイアウトから呼ばれる = 全ページが通る経路なので、D1が読めないときは
 * 出典表記だけ出して落とす(フッタのためにページ全体を500にしない)。
 */
export async function SiteFooter() {
  let generatedAt: string | null = null;
  let feedCount: number | null = null;
  try {
    const bundle = await getCurrentBundle();
    if (bundle) {
      generatedAt = jstDate(bundle.createdAt);
      feedCount = bundle.feedCount;
    }
  } catch {
    // 診断データの版が引けないだけ。フッタ以外は影響を受けない
  }

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-5 text-note text-ink-3">
        <p>
          出典: 地理院タイル(国土地理院) / GTFSデータリポジトリ(gtfs-data.jp)
          {feedCount === null ? "南信州のフィード" : `南信州${feedCount}フィード`}
        </p>
        <p className="mt-1">
          {generatedAt && `診断データ生成日: ${generatedAt}。`}
          本診断はオープンデータに基づく一次診断であり、実測補正で精度が向上します。
        </p>
      </div>
    </footer>
  );
}
