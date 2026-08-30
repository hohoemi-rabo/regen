"use client";

import { useState } from "react";
import type { ScenarioParams } from "@regen/core";
import { Button } from "@/app/_components/Button";

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done"; url: string }
  | { kind: "error"; message: string };

/**
 * 「この条件を保存して共有」(F-6-1)。
 * 保存した条件は /s/[id] で読み取り専用の記録として開ける。
 */
export function ShareButton({ params }: { params: () => ScenarioParams }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function save() {
    setState({ kind: "saving" });
    setCopied(false);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params()),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; path?: string; error?: string }
        | null;
      if (!res.ok || !body?.path) {
        setState({
          kind: "error",
          message:
            body?.error ??
            (res.status === 429
              ? "保存の間隔をあけてください"
              : `保存できませんでした(HTTP ${res.status})`),
        });
        return;
      }
      setState({ kind: "done", url: new URL(body.path, window.location.origin).toString() });
    } catch {
      setState({ kind: "error", message: "通信に失敗しました。時間をおいて試してください" });
    }
  }

  async function copy(url: string) {
    const flash = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(url);
      flash();
      return;
    } catch {
      // 非セキュアコンテキストや権限拒否では Clipboard API が使えない
    }
    // フォールバック: 選択して execCommand。古い経路だがどのブラウザでも動く
    const el = document.getElementById("share-url") as HTMLInputElement | null;
    if (!el) return;
    el.select();
    el.setSelectionRange(0, url.length);
    try {
      if (document.execCommand("copy")) flash();
    } catch {
      // ここまで来たら選択状態のままにして、手でコピーしてもらう
    }
  }

  if (state.kind === "done") {
    return (
      <div className="w-full">
        <p className="text-aux font-semibold text-ink-2">共有URLを発行しました</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="share-url"
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-body sm:h-10"
          />
          <Button onClick={() => copy(state.url)}>{copied ? "コピーしました" : "URLをコピー"}</Button>
          <a
            href={state.url}
            className="text-body font-semibold text-accent hover:text-accent-strong"
          >
            開く →
          </a>
        </div>
        <p className="mt-2 text-note text-ink-3">
          このURLは条件・車両スペックを保存時のまま保持します。あとで車両マスタや診断データが
          更新されても数値は変わりません。検索エンジンには載りません。
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-2 text-note text-accent hover:text-accent-strong"
        >
          別の条件で保存し直す
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button onClick={save} disabled={state.kind === "saving"}>
        {state.kind === "saving" ? "保存しています…" : "この条件を保存して共有"}
      </Button>
      {state.kind === "error" ? (
        <span className="text-note text-verdict-cond-text">{state.message}</span>
      ) : (
        <span className="text-note text-ink-3">
          補助金申請や社内説明に添付できる記録ページのURLを発行します。
        </span>
      )}
    </div>
  );
}
