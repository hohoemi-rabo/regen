"use client";

import { useId } from "react";

/** 文字入力(DESIGN §5.9 に高さ・角丸・罫線を揃える)。数値と違い左寄せ */
export function TextField({
  label,
  value,
  type = "text",
  placeholder,
  hint,
  error,
  autoComplete,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "email" | "password" | "url";
  placeholder?: string;
  hint?: string;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-aux text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-btn border border-line bg-surface px-3 text-body disabled:text-ink-3 sm:h-10"
      />
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

/** 長文(車両の開示文など)。行数は内容に合わせて呼び出し側で決める */
export function TextArea({
  label,
  value,
  rows = 4,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-aux text-ink-2">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-btn border border-line bg-surface px-3 py-2 text-body"
      />
      {hint && <p className="mt-1 text-note text-ink-3">{hint}</p>}
    </div>
  );
}

/** 選択(フィルタ行の Select とは別物。あちらは「すべて」行を必ず持つ) */
export function SelectField({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  hint?: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-aux text-ink-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-btn border border-line bg-surface px-3 text-body sm:h-10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-note text-ink-3">{hint}</p>}
    </div>
  );
}
