"use client";

import Link from "next/link";
import { Button } from "@/app/_components/Button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-16 text-center">
      <h1 className="text-page-title">車両比較を表示できませんでした</h1>
      <p className="mt-2 text-body text-ink-2">
        {error.message || "再計算に必要なプロファイルを読み込めませんでした。"}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button onClick={reset}>再試行</Button>
        <Link href="/routes" className="text-body font-semibold text-accent hover:text-accent-strong">
          路線一覧へ
        </Link>
      </div>
    </main>
  );
}
