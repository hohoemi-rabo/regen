"use client";

import { useId } from "react";
import type { FieldKey } from "../lib/csv";
import type { ColumnMap } from "../lib/prepare";

const LABELS: { key: FieldKey; label: string; required: boolean; hint: string }[] = [
  { key: "date", label: "日付", required: true, hint: "季節(空調の強さ)の判定に使います" },
  { key: "distance", label: "走行距離", required: true, hint: "km として読みます" },
  { key: "consumption", label: "消費量", required: true, hint: "電力量 kWh または 軽油 L" },
  { key: "duration", label: "運行時間(任意)", required: false, hint: "あると空調と走行を分けやすくなります" },
];

/**
 * 見出し行と項目の対応づけ。
 *
 * デジタコの書き出し形式は事業者ごとに違うので、**固定フォーマットを強制せず**
 * ヘッダ名から推定した結果を出して、違っていれば直せるようにする。
 */
export function ColumnMapper({
  header,
  value,
  onChange,
}: {
  header: string[];
  value: ColumnMap;
  onChange: (next: ColumnMap) => void;
}) {
  const baseId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LABELS.map(({ key, label, required, hint }) => {
        const id = `${baseId}-${key}`;
        return (
          <div key={key}>
            <label htmlFor={id} className="text-aux text-ink-2">
              {label}
              {required && <span className="ml-1 text-verdict-cond-text">必須</span>}
            </label>
            <select
              id={id}
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
              className={`mt-1 h-11 w-full rounded-btn border border-line px-3 text-body sm:h-10 ${
                value[key] >= 0 ? "bg-accent-weak" : "bg-surface"
              }`}
            >
              <option value={-1}>{required ? "— 選んでください —" : "— 使わない —"}</option>
              {header.map((h, i) => (
                <option key={`${h}-${i}`} value={i}>
                  {h || `(${i + 1}列目)`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-note text-ink-3">{hint}</p>
          </div>
        );
      })}
    </div>
  );
}
