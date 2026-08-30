import { getAuth, hasNoAdmin, matchesSetupToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2048;

/**
 * POST /api/admin/setup — 管理者の初回登録(要件§11-6)。
 *
 * **公開の登録経路ではない。** 次の両方が成り立つときだけ通る:
 *   1. 管理者がまだ1人もいない
 *   2. 合い言葉が `ADMIN_SETUP_TOKEN`(wrangler secret)と一致する
 *
 * どちらかを満たさなければ **404**(「ここに登録口がある」ことを教えない)。
 * 登録経路そのものは `/api/auth/sign-up/email` を404で塞いであるので、
 * ここがサーバー側から `auth.api.signUpEmail()` を呼ぶ唯一の入口になる。
 */
export async function POST(request: Request) {
  const notFound = () => new Response("Not Found", { status: 404 });

  if (!(await hasNoAdmin())) return notFound();
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "content-type は application/json にしてください" }, { status: 415 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    return Response.json({ error: "入力が大きすぎます" }, { status: 413 });
  }

  let body: { email?: unknown; password?: unknown; name?: unknown; token?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSONとして読めません" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!(await matchesSetupToken(token))) return notFound();

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : "管理者";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }
  if (password.length < 12) {
    return Response.json({ error: "パスワードは12文字以上にしてください" }, { status: 400 });
  }

  const auth = await getAuth();
  try {
    // 競合で2人目が作られないよう、直前にもう一度数える(D1に一意制約は張れない)
    if (!(await hasNoAdmin())) return notFound();
    const res = await auth.api.signUpEmail({
      body: { email, password, name },
      asResponse: true,
    });
    return res;
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "登録できませんでした" },
      { status: 400 }
    );
  }
}
