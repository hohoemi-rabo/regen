"use client";

import { useId } from "react";

/**
 * 仮定値を動かすスライダー(DESIGN §5.8)。
 * ネイティブの input[type=range] に accent-color を当てるだけにして、
 * キーボード操作・スクリーンリーダー・タッチを標準実装のまま使う。
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  display,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** 表示用に整形した現在値。省略時は value をそのまま出す */
  display?: string;
  /** 既定値。ここから動いていると現在値をアクセント色にする */
  defaultValue?: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const moved = defaultValue !== undefined && value !== defaultValue;
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-aux text-ink-2">
          {label}
        </label>
        <span className={`text-body font-semibold tabular-nums ${moved ? "text-accent" : ""}`}>
          {display ?? value}
          <span className="ml-1 text-aux font-normal text-ink-2">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-6 w-full cursor-pointer [accent-color:var(--accent)]"
      />
      <div className="flex justify-between text-note-sm text-ink-3">
        <span className="tabular-nums">{min}</span>
        <span className="tabular-nums">{max}</span>
      </div>
    </div>
  );
}
