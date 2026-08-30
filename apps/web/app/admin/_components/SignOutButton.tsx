"use client";

import { useState } from "react";
import { Button } from "@/app/_components/Button";

/**
 * ログアウト。better-auth の React クライアントは使わず、エンドポイントを直に叩く
 * (公開画面のバンドルに認証ライブラリのコードを混ぜないため — 受入条件)。
 *
 * **`content-type: application/json` と本文を必ず付ける。** 付けないと better-auth は
 * 415 を返し、**Cookieが消えないままログアウトしたつもりになる**。その状態で
 * `/admin/login` へ送ると、ログイン画面は有効なセッションを見つけて `/admin` へ送り返すので、
 * 「押しても管理画面に戻る」という形で表に出る。
 *
 * 遷移は `router.replace` ではなく**ページ全体の遷移**にする。Cookieを消した直後は
 * Routerのキャッシュに古い判定が残りうるので、ブラウザに引き直させる。
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-note-sm text-verdict-cond-text">{error}</span>}
      <Button
        variant="ghost"
        type="button"
        disabled={busy}
        className="px-2"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            });
            // 失敗を黙って飲まない。ログアウトできていないのに
            // ログイン画面へ送ると「できたつもり」になる
            if (!res.ok) throw new Error(String(res.status));
            window.location.assign("/admin/login");
          } catch {
            setBusy(false);
            setError("ログアウトできませんでした。もう一度お試しください");
          }
        }}
      >
        {busy ? "ログアウト中…" : "ログアウト"}
      </Button>
    </div>
  );
}
