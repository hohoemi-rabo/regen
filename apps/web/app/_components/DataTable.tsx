import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  /** 数値列は "right"(右寄せ + tabular-nums が自動で付く — DESIGN §5.5) */
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** セルの追加クラス(判定列の色など) */
  cellClass?: (row: T) => string;
};

export type SortState = { key: string; dir: "asc" | "desc" };

/**
 * 表(DESIGN §5.5)。ゼブラなし・行下罫線のみ。
 * 横スクロールはこのコンテナ内で完結させ、ページ本体を横スクロールさせない。
 * `onSort` を渡すとヘッダがソートボタンになる(Client Componentからのみ)。
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 640,
  sort,
  onSort,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** 表本体の最小幅px(これ未満はコンテナ内スクロール) */
  minWidth?: number;
  sort?: SortState;
  onSort?: (key: string) => void;
  /** 行クリック遷移。キーボード到達はrender側でリンクを置いて担保する */
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-aux" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-baseline text-left font-semibold text-ink-2">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`p-0 ${c.align === "right" ? "text-right" : ""}`}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      className={`w-full whitespace-nowrap p-2 font-semibold transition-colors duration-fast hover:text-accent ${
                        c.align === "right" ? "text-right" : "text-left"
                      } ${active ? "text-accent" : ""}`}
                    >
                      {c.header}
                      <span aria-hidden="true">{active ? (sort!.dir === "asc" ? " ▲" : " ▼") : ""}</span>
                    </button>
                  ) : (
                    <span className="block whitespace-nowrap p-2">{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-grid transition-colors duration-fast last:border-b-0 hover:bg-row-hover ${
                onRowClick ? "cursor-pointer" : ""
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`p-2 ${c.align === "right" ? "text-right tabular-nums" : ""} ${
                    c.cellClass?.(row) ?? ""
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
