import { revalidatePath } from "next/cache";
import { normalizeVehicle } from "@regen/core";
import { listAllVehicles, upsertVehicle } from "@/lib/data";
import { requireAdminApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 1件あたりの上限。note(開示文)が最長で、実測は2KB以内 */
const MAX_BYTES = 8 * 1024;

/** GET /api/admin/vehicles — 非公開行を含む全件(F-7-2) */
export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;
  const vehicles = await listAllVehicles();
  return Response.json({ count: vehicles.length, vehicles });
}

/**
 * POST /api/admin/vehicles — 追加・更新(F-7-2、要件§7)。
 *
 * 認証済みの経路だが、`POST /api/scenarios` と同じだけ検証する。
 * 値域の壊れた車両を入れると比較画面(F-3)の計算そのものが壊れるため。
 * **受け取ったJSONをそのまま保存しない。**
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "content-type は application/json にしてください" }, { status: 415 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return Response.json({ error: `車両1件が大きすぎます(${MAX_BYTES} バイトまで)` }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSONとして読めません" }, { status: 400 });
  }

  const norm = normalizeVehicle(parsed);
  if (!norm.ok) return Response.json({ error: norm.error }, { status: 400 });

  await upsertVehicle(norm.value);
  // 比較画面(F-3)の車種セレクタと /api/vehicles はISRで持たれている
  revalidatePath("/routes/[id]/compare", "page");
  revalidatePath("/api/vehicles");
  return Response.json({ ok: true, id: norm.value.id });
}
