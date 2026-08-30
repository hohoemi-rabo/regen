import { getCloudflareContext } from "@opennextjs/cloudflare";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

/** 認証の口。キャッシュしない(CLAUDE.md: キャッシュ挙動は暗黙に任せない) */
export const dynamic = "force-dynamic";

/**
 * Better Auth のエンドポイント(F-7-1)。
 *
 * **公開の登録経路を持たない。** better-auth は emailAndPassword を有効にすると
 * `/sign-up/email` を生やすので、ここで明示的に404にする。管理者の初回登録は
 * `/api/admin/setup` が合い言葉を確かめたうえでサーバー側から `auth.api.signUpEmail()` を
 * 呼ぶ(要件§11-6)。この404がその境界の実体で、ライブラリの設定に依存しない。
 */
const BLOCKED = ["/sign-up/email", "/sign-up"];

function blocked(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return BLOCKED.some((p) => pathname.endsWith(p));
}

const notFound = () => new Response("Not Found", { status: 404 });

export async function GET(request: Request) {
  if (blocked(request)) return notFound();
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: Request) {
  if (blocked(request)) return notFound();

  // ログインは総当たりの的なので、Cloudflare側のレート制限を通す
  if (new URL(request.url).pathname.endsWith("/sign-in/email")) {
    const { env } = await getCloudflareContext({ async: true });
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    // IPは制限キーに使うだけで保存しない(§5.3 個人情報を収集しない)
    if (env.ADMIN_LIMITER && !(await env.ADMIN_LIMITER.limit({ key: `login:${ip}` })).success) {
      return Response.json(
        { error: "試行の間隔をあけてください(1分あたり5回まで)" },
        { status: 429 }
      );
    }
  }

  return toNextJsHandler(await getAuth()).POST(request);
}
