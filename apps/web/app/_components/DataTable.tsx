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

/**
 * 表(DESIGN §5.5)。ゼブラなし・行下罫線のみ。
 * 横スクロールはこのコンテナ内で完結させ、ページ本体を横スクロールさせない。
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 640,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** 表本体の最小幅px(これ未満はコンテナ内スクロール) */
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-aux" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-baseline text-left font-semibold text-ink-2">
            {columns.map((c) => (
              <th key={c.key} className={`p-2 ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-grid transition-colors duration-fast last:border-b-0 hover:bg-row-hover"
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
