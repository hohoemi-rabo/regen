import { getCurrentBundle, getRoutesGeoJson } from "@/lib/data";

export const revalidate = 86400;

/**
 * GET /api/map — F-1マップ用のGeoJSON(全路線サマリー+ポリライン)。
 * 要件§6.2の `bundles/<version>/routes.json` をWorker経由で配信する(§3.1「署名なし配信」)。
 * どの版を返すかは D1 の bundles.is_current だけで決まる。
 */
export async function GET() {
  const bundle = await getCurrentBundle();
  if (!bundle) return Response.json({ error: "no current bundle" }, { status: 503 });

  const obj = await getRoutesGeoJson(bundle.version);
  if (!obj) return Response.json({ error: "routes.json missing in R2" }, { status: 404 });

  return new Response(obj.body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600, s-maxage=604800",
    },
  });
}
