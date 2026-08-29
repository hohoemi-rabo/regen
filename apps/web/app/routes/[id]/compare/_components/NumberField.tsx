"use client";

import { useId } from "react";

/** 金額・日数の入力(DESIGN §5.9)。空欄は0、負値は受け付けない */
export function NumberField({
  label,
  value,
  unit,
  min = 0,
  max,
  step = 1,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-aux text-ink-2">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return onChange(min);
            onChange(Math.max(min, max === undefined ? n : Math.min(max, n)));
          }}
          className="h-11 w-full min-w-0 rounded-btn border border-line bg-surface px-3 text-right text-body tabular-nums sm:h-10"
        />
        <span className="shrink-0 text-aux text-ink-2">{unit}</span>
      </div>
      {hint && <p className="mt-1 text-note text-ink-3">{hint}</p>}
    </div>
  );
}
