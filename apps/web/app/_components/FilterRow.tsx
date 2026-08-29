"use client";

export type FilterDef = {
  key: string;
  /** セレクト先頭の「すべて」行に使うラベル(例「事業者」→「すべての事業者」) */
  label: string;
  /** 現在値。空文字 = 未選択(すべて) */
  value: string;
  options: { value: string; label: string }[];
};

/**
 * フィルタ行(DESIGN §5.7)。地図・一覧の上部に1行で置く。
 * 状態は親から制御する。フィルタで件数が変わっても残った路線の色は変えない(親側の規律)。
 */
export function FilterRow({
  filters,
  onChange,
  onClear,
}: {
  filters: FilterDef[];
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const anyActive = filters.some((f) => f.value !== "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <label key={f.key} className="inline-flex">
          <span className="sr-only">{f.label}</span>
          <select
            value={f.value}
            onChange={(e) => onChange(f.key, e.target.value)}
            className={`h-9 rounded-btn border border-line px-2 text-aux text-ink-1 transition-colors duration-fast ${
              f.value !== "" ? "bg-accent-weak" : "bg-surface"
            }`}
          >
            <option value="">すべての{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="button"
        onClick={onClear}
        disabled={!anyActive}
        className="ml-auto h-9 rounded-btn px-2 text-aux font-semibold text-accent transition-colors duration-fast hover:text-accent-strong disabled:text-ink-3"
      >
        絞り込み解除
      </button>
    </div>
  );
}
