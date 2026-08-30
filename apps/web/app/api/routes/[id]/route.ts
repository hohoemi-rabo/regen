import { getRoute } from "@/lib/data";

export const revalidate = 3600;

/** GET /api/routes/[id] (要件§7) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const route = await getRoute(id);
  if (!route) return Response.json({ error: "route not found" }, { status: 404 });
  return Response.json(route);
}
