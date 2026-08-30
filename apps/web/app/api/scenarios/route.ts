import { SCENARIO_MAX_BYTES, normalizeScenarioParams } from "@regen/core";
import { checkRateLimit, createScenario, getRoute } from "@/lib/data";

/** 書き込み口。キャッシュしない(CLAUDE.md: キャッシュ挙動は暗黙に任せない) */
export const dynamic = "force-dynamic";

/**
 * POST /api/scenarios — 条件を保存して共有IDを返す(F-6-1)。
 *
 * 認証がないので誰でも叩ける。CLAUDE.mdのServer Actions節と同じ姿勢で、
 * 引数を信用せず型と値域を検証し、サイズ上限とレート制限を課す。
 * 検証エラーは日本語、内部起因は英語(既存ハンドラの書き分けに合わせる)。
 */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "content-type は application/json にしてください" }, { status: 415 });
  }

  // 本文は先に文字列で読んで実バイト数で判定する。Content-Length は詐称できる
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > SCENARIO_MAX_BYTES) {
    return Response.json(
      { error: `条件が大きすぎます(${SCENARIO_MAX_BYTES} バイトまで)` },
      { status: 413 }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSONとして読めません" }, { status: 400 });
  }

  const norm = normalizeScenarioParams(parsed);
  if (!norm.ok) return Response.json({ error: norm.error }, { status: 400 });

  // 実在する路線か。D1に外部キー違反を投げる前に弾く
  const route = await getRoute(norm.value.routeId);
  if (!route) return Response.json({ error: "指定の路線が見つかりません" }, { status: 400 });

  // IPは制限キーに使うだけで保存しない(F-6-3 個人情報を収集しない)
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await checkRateLimit(`scenario:${ip}`))) {
    return Response.json(
      { error: "保存の間隔をあけてください(1分あたり10件まで)" },
      { status: 429 }
    );
  }

  const id = await createScenario(norm.value);
  return Response.json({ id, path: `/s/${id}` }, { status: 201 });
}
