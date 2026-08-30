import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "../_components/AuthForm";

export const metadata: Metadata = {
  title: "管理ログイン | Regen",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // 既にログイン済みならフォームを見せない
  if (await getSession()) redirect("/admin");
  return (
    <main className="mx-auto w-full max-w-[420px] px-4 py-16">
      <h1 className="text-page-title">管理ログイン</h1>
      <p className="mt-1 text-aux text-ink-2">管理者のみが使う画面です。</p>
      <div className="mt-6">
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
