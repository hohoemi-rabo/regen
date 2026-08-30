import { isScenarioId } from "@regen/core";
import { getScenario } from "@/lib/data";

/** 保存済みシナリオは作られた後は変わらない。長めに保持する */
export const revalidate = 86400;

/** GET /api/scenarios/[id] — 保存済みシナリオを取得(要件§7) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isScenarioId(id)) {
    return Response.json({ error: "scenario not found" }, { status: 404 });
  }
  const scenario = await getScenario(id);
  if (!scenario) return Response.json({ error: "scenario not found" }, { status: 404 });

  return Response.json({
    id: scenario.id,
    routeId: scenario.routeId,
    createdAt: new Date(scenario.createdAt).toISOString(),
    params: scenario.params,
  });
}
