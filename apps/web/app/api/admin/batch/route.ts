import { getCurrentBundle, listBatchRuns, listFeeds } from "@/lib/data";
import { requireAdminApi } from "@/lib/auth";

/** 管理画面に古い状態を見せない。公開GETの revalidate を真似ない */
export const dynamic = "force-dynamic";

/** GET /api/admin/batch — バッチ実行状況・現在の版・フィード(F-7-3 / 要件§7) */
export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const [runs, feeds, bundle] = await Promise.all([listBatchRuns(20), listFeeds(), getCurrentBundle()]);
  return Response.json({ runs, feeds, bundle });
}
