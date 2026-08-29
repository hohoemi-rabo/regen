/**
 * 数値タイル(DESIGN §5.3)。値は26px tabular-nums。
 * hint は「その数値をどう読むか」を書く(単位の言い換えは書かない)。
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-tile border border-line bg-surface px-4 py-3.5">
      <div className="text-note text-ink-2">{label}</div>
      <div className="mt-0.5 text-tile tabular-nums">
        {value}
        {unit && <span className="ml-1 text-body font-normal text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-note-sm text-ink-3">{hint}</div>}
    </div>
  );
}

/** auto-fitグリッド(minmax 168px、gap 12px — DESIGN §5.3) */
export function StatTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-3">{children}</div>;
}
