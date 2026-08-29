import { VERDICTS, type Verdict } from "./verdict";

/**
 * 判定チップ(DESIGN §5.1)。表のセル・地図ポップアップ・カード見出しで共通。
 * 記号 + ラベルを常に併記する。
 */
export function VerdictChip({
  verdict,
  withBackground = false,
  onDark = false,
  className = "",
}: {
  verdict: Verdict;
  withBackground?: boolean;
  /** 結論バッジ等ダークタイル上での使用(条件付きの文字色が変わる) */
  onDark?: boolean;
  className?: string;
}) {
  const v = VERDICTS[verdict];
  const color = onDark ? v.onDarkTextClass : v.textClass;
  const bg = withBackground ? `${v.bgClass} rounded-btn px-2 py-0.5` : "";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${color} ${bg} ${className}`}>
      <span aria-hidden="true">{v.symbol}</span>
      {verdict}
    </span>
  );
}
