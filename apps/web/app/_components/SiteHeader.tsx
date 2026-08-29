import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="h-12 border-b border-line bg-surface">
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4">
        <Link href="/" className="text-section font-semibold text-ink-1">
          Regen
        </Link>
        <nav className="flex items-center gap-5 text-body">
          <Link href="/routes" className="text-ink-2 transition-colors duration-fast hover:text-accent">
            路線一覧
          </Link>
          <Link href="/about" className="text-ink-2 transition-colors duration-fast hover:text-accent">
            このサービスについて
          </Link>
        </nav>
      </div>
    </header>
  );
}
