import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * 未認証リクエストを**描画の前に**弾く(F-7-1)。
 *
 * これは第一段。`redirect()` をレイアウトでやるだけだと、ストリーミングが始まった後に
 * 投げられるので HTTP としては 200 + クライアント側遷移になり、ブラウザ以外からは
 * 「弾かれた」ように見えない。ここで 307 / 401 を返して境界をHTTPの層に出す。
 *
 * **これは保護の実体ではない。** 見ているのはCookieの有無だけで、中身の検証はしていない。
 * セッションが本物かどうかは `app/admin/(protected)/layout.tsx` と各 `/api/admin/*` の
 * `requireAdmin` / `requireAdminApi` が確かめる(そちらがD1を引く)。
 * middleware から `getCloudflareContext().env` は呼べない(CLAUDE.md)ので、この二段になる。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインと初回登録は未認証で開けないと始まらない。
  // `/api/admin/setup` も同じ理由で通す — こちらは「管理者0人」と合い言葉の
  // 両方を自分で確かめてから登録する(app/api/admin/setup/route.ts)
  const OPEN = ["/admin/login", "/admin/setup", "/api/admin/setup"];
  if (OPEN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
