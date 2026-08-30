import { getCurrentBundle, listFeeds } from "@/lib/data";

export const revalidate = 3600;

/** GET /api/meta — データ生成日時・出典・件数(要件§7) */
export async function GET() {
  const bundle = await getCurrentBundle();
  const feeds = await listFeeds();
  if (!bundle) {
    return Response.json({ service: "regen", error: "no current bundle" }, { status: 503 });
  }
  return Response.json({
    service: "regen",
    version: bundle.version,
    generatedAt: new Date(bundle.createdAt).toISOString(),
    routeCount: bundle.routeCount,
    feedCount: bundle.feedCount,
    source: bundle.sourceNote,
    params: bundle.paramsJson ? JSON.parse(bundle.paramsJson) : null,
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, feedEnd: f.feedEnd })),
  });
}
