"use client";

import { useId } from "react";

/**
 * 数値入力(DESIGN §5.9)。
 *
 * `nullable` を付けると**空欄をnullとして扱う**。ディーゼルの電池容量のように
 * 「値が無い」ことと「0」を区別しないといけない項目があるため(0にすると比較画面が壊れる)。
 */
export function NumberField({
  label,
  value,
  unit,
  min = 0,
  max,
  step = 1,
  hint,
  error,
  nullable = false,
  onChange,
}: {
  label: string;
  value: number | null;
  /** 単位。無い項目は空文字 */
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  /** 検証エラー。出すときは aria-invalid も付く */
  error?: string;
  nullable?: boolean;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-aux text-ink-2">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(nullable ? null : min);
            const n = Number(raw);
            if (Number.isNaN(n)) return onChange(nullable ? null : min);
            onChange(Math.max(min, max === undefined ? n : Math.min(max, n)));
          }}
          className="h-11 w-full min-w-0 rounded-btn border border-line bg-surface px-3 text-right text-body tabular-nums sm:h-10"
        />
        {unit && <span className="shrink-0 text-aux text-ink-2">{unit}</span>}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-note-sm text-verdict-cond-text">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-note text-ink-3">{hint}</p>
      )}
    </div>
  );
}
