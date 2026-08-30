"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * ログアウト。better-auth の React クライアントは使わず、エンドポイントを直に叩く
 * (公開画面のバンドルに認証ライブラリのコードを混ぜないため — 受入条件)。
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.replace("/admin/login");
        router.refresh();
      }}
      className="font-semibold text-accent hover:text-accent-strong disabled:text-ink-3"
    >
      ログアウト
    </button>
  );
}
