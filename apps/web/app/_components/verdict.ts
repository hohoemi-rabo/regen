/**
 * 判定表示の単一の信頼できる情報源(DESIGN §2.3 / §5.1)。
 * 判定は色 + 記号 + ラベルの3重で伝える。色だけ・記号だけの経路を作らない。
 */
export type Verdict = "適" | "条件付き" | "要検討";

export const VERDICTS: Record<
  Verdict,
  { symbol: string; textClass: string; onDarkTextClass: string; bgClass: string }
> = {
  適: {
    symbol: "●",
    textClass: "text-verdict-ok",
    onDarkTextClass: "text-verdict-ok",
    bgClass: "bg-verdict-ok-bg",
  },
  条件付き: {
    symbol: "▲",
    // アンバー#fab219は文字に使わない。文字は濃色#b45309(DESIGN §2.3)
    textClass: "text-verdict-cond-text",
    // ダークタイル上のみアンバー本来の色が使える(暗地でコントラスト確保)
    onDarkTextClass: "text-verdict-cond",
    bgClass: "bg-verdict-cond-bg",
  },
  要検討: {
    symbol: "■",
    textClass: "text-verdict-ng",
    onDarkTextClass: "text-verdict-ng",
    bgClass: "bg-verdict-ng-bg",
  },
};

export function isVerdict(v: string): v is Verdict {
  return v in VERDICTS;
}
