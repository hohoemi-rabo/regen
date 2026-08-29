import { VerdictChip } from "./VerdictChip";
import type { Verdict } from "./verdict";

/**
 * 結論バッジ(DESIGN §5.2)。診断書の最上部に置くダークタイル。
 * ヒーロー数値(44px)は1画面に1つだけ — このコンポーネント以外で text-hero を使わない。
 */
export function ConclusionBadge({
  verdict,
  label,
  value,
  unit,
  caption,
  note,
}: {
  verdict: Verdict;
  /** チップ右の見出し(例「EV化可能 ── 条件付き」) */
  label: string;
  /** ヒーロー数値(例「59」)。プロポーショナル数字のまま出す */
  value: string;
  unit?: string;
  /** 数値の説明(例「冬季1往復でのバッテリー使用率」) */
  caption: string;
  /** 結論の補足文(例「1日16便を走らせるには日中5回の充電が必要」) */
  note?: string;
}) {
  return (
    <section className="rounded-card bg-surface-dark p-5 text-ink-on-dark sm:p-6">
      <div className="flex items-center gap-3">
        <VerdictChip verdict={verdict} onDark />
        <span className="text-body font-semibold">{label}</span>
      </div>
      <div className="mt-3 text-hero">
        {value}
        {unit && <span className="ml-1 text-body text-ink-3">{unit}</span>}
      </div>
      <div className="mt-1 text-note text-ink-3">{caption}</div>
      {note && <p className="mt-3 text-body">{note}</p>}
    </section>
  );
}
