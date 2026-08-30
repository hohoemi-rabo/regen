"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/_components/Button";

/**
 * ログアウト。better-auth の React クライアントは使わず、エンドポイントを直に叩く
 * (公開画面のバンドルに認証ライブラリのコードを混ぜないため — 受入条件)。
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // 共通のButton(DESIGN §5.6 Ghost)を使う。自前で組むと、置き場所の
  // `text-note` を継いで12pxになり、探しても見つからない大きさになる
  return (
    <Button
      variant="ghost"
      type="button"
      disabled={busy}
      className="px-2"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      {busy ? "ログアウト中…" : "ログアウト"}
    </Button>
  );
}
