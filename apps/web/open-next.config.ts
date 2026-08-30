import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * generateStaticParams を使うページ(F-2診断書・F-3比較の46路線)は、OpenNextでは
 * 素の静的アセットではなく incremental cache 経由で配信される。
 * これを設定しないとプリレンダリング済みでも404になる。
 *
 * バンドル用のR2バケットを prefix 付きで共用する(NEXT_INC_CACHE_R2_PREFIX)。
 * 診断バンドルは bundles/ 配下なのでキーが衝突しない。
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
