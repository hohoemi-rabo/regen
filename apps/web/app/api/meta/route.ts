import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DATA_VERSION } from "@/lib/site";

/**
 * D1バインディングの疎通確認用。
 * wrangler.jsonc の d1_databases を有効化するまでは binding: "none" が返る(正常)。
 */
export async function GET() {
  let binding = "none";
  try {
    const { env } = getCloudflareContext();
    if ((env as Record<string, unknown>).DB) binding = "d1";
  } catch {
    // next dev をOpenNext初期化なしで動かした場合など
  }
  return Response.json({ service: "regen", dataVersion: DATA_VERSION, binding });
}
