import { getProfile, getRoute } from "@/lib/data";

/** プロファイルは版ごとにキーが変わる = 事実上イミュータブル。長めに保持する */
export const revalidate = 86400;

/** GET /api/routes/[id]/profile — R2から返す(要件§7) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const route = await getRoute(id);
  if (!route) return Response.json({ error: "route not found" }, { status: 404 });

  const profile = await getProfile(route.bundleKey);
  if (!profile) {
    return Response.json({ error: "profile object missing in R2" }, { status: 404 });
  }
  return Response.json(profile, {
    headers: { "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
}
