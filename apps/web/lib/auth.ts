import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { account, session, user, verification } from "@regen/db";

/**
 * 管理画面(F-7)の認証。**一般利用者側には一切出さない**(CLAUDE.md #4)。
 *
 * D1バインディングはリクエスト中にしか取れないので、`betterAuth()` をモジュール定数に
 * できない。`cache()` で1リクエスト内だけ使い回す。
 *
 * secret は `process.env` ではなくバインディングから読む。`nodejs_compat` だけでは
 * Workers のシークレットが `process.env` に載らない。
 */
export const getAuth = cache(async () => {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET が設定されていません(要件§11-5)。" +
        "ローカルは apps/web/.dev.vars、本番は wrangler secret put で登録してください"
    );
  }
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      // メール送信の口を持たないので確認メールは使わない(管理者1人の運用)
      requireEmailVerification: false,
      minPasswordLength: 12,
    },
  });
});

export type AdminSession = NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getAuth>>["api"]["getSession"]>>>;

/** セッションを引く。無ければ null */
export async function getSession(): Promise<AdminSession | null> {
  const auth = await getAuth();
  return (await auth.api.getSession({ headers: await headers() })) as AdminSession | null;
}

/**
 * 画面用のガード。未認証ならログイン画面へ送る。
 * **これが保護の実体。** middleware は置かない(Cookieの有無しか見られず、
 * `getCloudflareContext().env` も Server Component / Route Handler / Server Action からのみ
 * 呼べる — CLAUDE.md)。
 */
export async function requireAdmin(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

/**
 * API用のガード。未認証なら **401 を返す**(リダイレクトしない)。
 * 戻り値が Response ならそのまま返すこと。
 */
export async function requireAdminApi(): Promise<AdminSession | Response> {
  const s = await getSession();
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  return s;
}

/** 管理者がまだ1人もいないか(初回登録の可否 — 要件§11-6) */
export async function hasNoAdmin(): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM user").first<{ c: number }>();
  return (row?.c ?? 0) === 0;
}

/** 合い言葉の照合。長さの違いも含めて時間差を作らない */
export async function matchesSetupToken(input: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const expected = env.ADMIN_SETUP_TOKEN;
  if (!expected) return false;
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const b = await crypto.subtle.digest("SHA-256", enc.encode(expected));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
