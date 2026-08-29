import { formatInt, formatKm, formatNumber } from "@/lib/format";

/** 診断書の各ブロック。カード + 見出し + 説明 の型を揃える(プロトタイプの構成に準拠) */
export function Section({
  title,
  caption,
  children,
  className = "",
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-surface p-5 ${className}`}>
      <h2 className="text-section">{title}</h2>
      {caption && <p className="mt-0.5 text-note text-ink-3">{caption}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** 横棒グラフ1本。比較の基準は最大値 */
export function Bar({
  label,
  value,
  max,
  display,
  variant = "ev",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  variant?: "ev" | "diesel";
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, 1) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-aux text-ink-2">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className={`h-6 rounded-r-btn ${variant === "ev" ? "bg-accent" : "bg-chart-series2"}`}
          style={{ width: `${pct}%` }}
        />
        <span className="shrink-0 text-aux font-semibold tabular-nums">{display}</span>
      </div>
    </div>
  );
}

export function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-grid py-1.5 last:border-b-0">
      <dt className="text-aux text-ink-2">{label}</dt>
      <dd className="text-aux tabular-nums">{value}</dd>
    </div>
  );
}

export const fmt = { formatInt, formatKm, formatNumber };
