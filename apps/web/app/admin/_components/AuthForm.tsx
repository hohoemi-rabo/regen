"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/_components/Button";
import { TextField } from "@/app/_components/TextField";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

/**
 * ログイン / 初回登録のフォーム(F-7-1 / 要件§11-6)。
 *
 * **better-auth の React クライアントを使わない。** エンドポイントを直に `fetch` することで、
 * 認証ライブラリのクライアントコードがバンドルに一切入らない(受入条件)。
 */
export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const isSetup = mode === "setup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "busy" });
    try {
      const res = await fetch(isSetup ? "/api/admin/setup" : "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isSetup ? { email, password, token } : { email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        setState({
          kind: "error",
          message:
            body?.error ??
            body?.message ??
            (res.status === 404
              ? "登録できません(合い言葉が違うか、管理者が既に登録済みです)"
              : res.status === 401
                ? "メールアドレスかパスワードが違います"
                : res.status === 429
                  ? "試行の間隔をあけてください"
                  : `失敗しました(HTTP ${res.status})`),
        });
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setState({ kind: "error", message: "通信に失敗しました" });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {isSetup && (
        <TextField
          label="合い言葉"
          value={token}
          type="password"
          autoComplete="off"
          hint="デプロイ時に登録した ADMIN_SETUP_TOKEN"
          onChange={setToken}
        />
      )}
      <TextField
        label="メールアドレス"
        value={email}
        type="email"
        autoComplete={isSetup ? "off" : "username"}
        onChange={setEmail}
      />
      <TextField
        label="パスワード"
        value={password}
        type="password"
        autoComplete={isSetup ? "new-password" : "current-password"}
        hint={isSetup ? "12文字以上" : undefined}
        onChange={setPassword}
      />

      {state.kind === "error" && (
        <p className="rounded-tile border border-line bg-page p-3 text-aux text-verdict-cond-text">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "処理中…" : isSetup ? "管理者を登録する" : "ログイン"}
      </Button>
    </form>
  );
}
