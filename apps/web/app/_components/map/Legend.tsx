import Link from "next/link";
import { VerdictChip } from "@/app/_components/VerdictChip";
import type { Verdict } from "@/app/_components/verdict";
import { VERDICTS } from "@/app/_components/verdict";

/** 凡例(左下浮動)。件数はフィルタ適用後の値。一覧表への導線を併設(F-1-6) */
export function Legend({ counts }: { counts: Record<Verdict, number> }) {
  return (
    <div className="pointer-events-auto rounded-tile border border-line bg-surface p-3 shadow-card">
      <ul className="space-y-1">
        {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
          <li key={v} className="flex items-center justify-between gap-4 text-aux">
            <VerdictChip verdict={v} />
            <span className="tabular-nums text-ink-2">{counts[v]}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/routes"
        className="mt-2 inline-block text-note font-semibold text-accent transition-colors duration-fast hover:text-accent-strong"
      >
        一覧表で見る →
      </Link>
    </div>
  );
}
