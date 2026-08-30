import { listRoutes } from "@/lib/data";

/** 診断値はバッチ更新のとき以外変わらない。1時間で再検証する(CLAUDE.md: GETは既定非キャッシュ) */
export const revalidate = 3600;

const VERDICTS = new Set(["適", "条件付き", "要検討"]);

/** GET /api/routes?verdict=適&agency=信南交通 (要件F-5 / §7) */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verdict = params.get("verdict") ?? undefined;
  const agency = params.get("agency") ?? undefined;

  // 認証のない公開エンドポイント。値域を検証してからD1へ渡す
  if (verdict && !VERDICTS.has(verdict)) {
    return Response.json({ error: "verdict は 適 / 条件付き / 要検討 のいずれか" }, { status: 400 });
  }
  if (agency && agency.length > 100) {
    return Response.json({ error: "agency が長すぎます" }, { status: 400 });
  }

  const routes = await listRoutes({ verdict, agency });
  return Response.json({ count: routes.length, routes });
}
