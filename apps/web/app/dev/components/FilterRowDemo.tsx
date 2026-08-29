"use client";

import { useState } from "react";
import { FilterRow } from "@/app/_components/FilterRow";

const DEFAULTS = { agency: "", verdict: "", grade: "" };

export function FilterRowDemo() {
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS);
  return (
    <div className="space-y-2">
      <FilterRow
        filters={[
          {
            key: "agency",
            label: "事業者",
            value: values.agency,
            options: [
              { value: "shinnan", label: "信南交通" },
              { value: "iida", label: "飯田市" },
              { value: "achi", label: "阿智村" },
            ],
          },
          {
            key: "verdict",
            label: "判定",
            value: values.verdict,
            options: [
              { value: "ok", label: "● 適" },
              { value: "cond", label: "▲ 条件付き" },
              { value: "ng", label: "■ 要検討" },
            ],
          },
          {
            key: "grade",
            label: "精度ランク",
            value: values.grade,
            options: [
              { value: "A", label: "A" },
              { value: "B", label: "B" },
            ],
          },
        ]}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        onClear={() => setValues(DEFAULTS)}
      />
      <p className="text-note text-ink-3">選択中: {JSON.stringify(values)}</p>
    </div>
  );
}
