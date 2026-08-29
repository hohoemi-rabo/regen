import Link from "next/link";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { formatKm } from "@/lib/format";
import type { RouteProps } from "./types";

/** 路線クリック時の要約(F-1-3)。デスクトップはポップアップ、モバイルは下部シートに載る */
export function RouteSummary({ route }: { route: RouteProps }) {
  return (
    <div className="min-w-[240px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-body font-semibold text-ink-1">{route.name}</div>
          <div className="text-note text-ink-2">{route.agency}</div>
        </div>
        <VerdictChip verdict={route.verdict} withBackground className="text-aux" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-aux">
        <Item label="路線長" value={`${formatKm(route.L)} km`} />
        <Item label="便数" value={`${route.trips}便/日`} />
        <Item label="往復電池" value={`${route.batt}%`} />
        <Item label="追加充電" value={`${route.charges}回/日`} />
      </dl>
      <Link
        href={`/routes/${route.id}`}
        className="mt-3 inline-block text-aux font-semibold text-accent transition-colors duration-fast hover:text-accent-strong"
      >
        診断書を見る →
      </Link>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tabular-nums text-ink-1">{value}</dd>
    </div>
  );
}
