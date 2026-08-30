import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-16 text-center">
      <h1 className="text-page-title">シナリオが見つかりません</h1>
      <p className="mt-2 text-body text-ink-2">
        URLが間違っているか、共有された条件が削除された可能性があります。
      </p>
      <div className="mt-6">
        <Link href="/routes" className="text-body font-semibold text-accent hover:text-accent-strong">
          路線一覧へ →
        </Link>
      </div>
    </main>
  );
}
