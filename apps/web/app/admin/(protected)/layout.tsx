import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { SignOutButton } from "../_components/SignOutButton";

/** 管理画面は事前生成しない(46路線のプリレンダリングとは別扱い) */
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/vehicles", label: "車両マスタ" },
  { href: "/admin/settings", label: "判定しきい値" },
];

/**
 * `/admin/*` の保護(F-7-1)。**これが認証の境界。**
 *
 * `/admin/login` と `/admin/setup` は**このルートグループの外**にあるので、ここは通らない。
 * パスを見て素通しする書き方にしない — 条件を1つ間違えると保護が丸ごと外れるため、
 * 「このレイアウトの下にあるものは全部保護される」という形にしてある。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-page-title">管理</h1>
        <div className="flex items-center gap-2">
          <span className="text-note text-ink-3">{session.user.email}</span>
          <SignOutButton />
        </div>
      </div>

      <nav className="mt-3 flex flex-wrap gap-4 border-b border-line pb-3 text-body">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="text-accent hover:text-accent-strong">
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="mt-card-gap space-y-card-gap">{children}</div>
    </main>
  );
}
