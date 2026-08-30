import { revalidatePath } from "next/cache";
import { isDefaultThresholds, normalizeThresholds } from "@regen/core";
import { countVerdictChanges, getThresholds, saveThresholds } from "@/lib/data";
import { requireAdminApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024;

/** GET /api/admin/settings — 現在の判定しきい値(F-7-4) */
export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;
  const thresholds = await getThresholds();
  return Response.json({ thresholds, isDefault: isDefaultThresholds(thresholds) });
}

/**
 * POST /api/admin/settings — しきい値の保存(F-7-4)。
 *
 * `?dryRun=1` を付けると保存せず「何路線の判定が変わるか」だけ返す。
 * 保存すると **その場で routes.verdict を付け替える**(即時反映)。
 * R2に焼かれた判定は次のバッチまで古いが、画面側がしきい値で計算し直すので表示は合う。
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "content-type は application/json にしてください" }, { status: 415 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return Response.json({ error: "設定が大きすぎます" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSONとして読めません" }, { status: 400 });
  }

  const th = normalizeThresholds(parsed);
  if (!th) {
    return Response.json(
      { error: "しきい値が範囲外です(勾配は分数で 0.02〜0.30、適の上限は条件付きの上限以下)" },
      { status: 400 }
    );
  }

  if (new URL(request.url).searchParams.get("dryRun") === "1") {
    return Response.json({ ok: true, dryRun: true, changed: await countVerdictChanges(th) });
  }

  const changed = await saveThresholds(th, guard.user.email ?? null);

  // 公開画面はISRで持たれている(一覧・診断書は revalidate=3600)。
  // 「即時反映」を名乗る以上、ここで捨てないと最大1時間古い判定が出続ける
  revalidatePath("/");
  revalidatePath("/routes");
  revalidatePath("/routes/[id]", "page");
  revalidatePath("/routes/[id]/compare", "page");

  return Response.json({ ok: true, changed, isDefault: isDefaultThresholds(th) });
}
