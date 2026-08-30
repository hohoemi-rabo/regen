import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasNoAdmin } from "@/lib/auth";
import { AuthForm } from "../_components/AuthForm";

export const metadata: Metadata = {
  title: "管理者の初回登録 | Regen",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * 管理者の初回登録(要件§11-6)。
 * **管理者が1人でもいれば404**にする。登録は合い言葉(ADMIN_SETUP_TOKEN)も要る。
 */
export default async function SetupPage() {
  if (!(await hasNoAdmin())) notFound();
  return (
    <main className="mx-auto w-full max-w-[420px] px-4 py-16">
      <h1 className="text-page-title">管理者の初回登録</h1>
      <p className="mt-1 text-aux text-ink-2">
        最初の管理者を1人だけ登録します。登録が済むとこのページは開けなくなります。
      </p>
      <div className="mt-6">
        <AuthForm mode="setup" />
      </div>
    </main>
  );
}
