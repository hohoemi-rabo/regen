"use client";

import type { TcoPoint } from "@regen/core";
import { formatNumber } from "@/lib/format";

// ElevationChart と同じ作法: 固定viewBox + var(--token) のみ
const VW = 840;
const VH = 320;
const ML = 76; // 左余白(円のラベルが長い)
const MR = 16;
const MT = 20;
const PH = 250;
const PW = VW - ML - MR;
const BASE = MT + PH;

/** 万円単位に丸めた目盛りを4本前後 */
function niceTicks(max: number): number[] {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t);
  return ticks;
}

const man = (yen: number) => `${formatNumber(yen / 10000, 0)}万`;

/**
 * TCO(累計コスト)の2系列折れ線(DESIGN §5.10)。
 * 横軸=年、縦軸=累計コスト。交点に損益分岐年数を注記する。
 */
export function TcoChart({
  series,
  years,
  breakEven,
  nameA,
  nameB,
}: {
  series: TcoPoint[];
  years: number;
  /** 損益分岐年数。期間内に交わらなければ null */
  breakEven: number | null;
  nameA: string;
  nameB: string;
}) {
  const max = Math.max(...series.map((p) => Math.max(p.a, p.b)), 1);
  const ticks = niceTicks(max);
  const hi = ticks[ticks.length - 1];

  const xOf = (year: number) => ML + (year / years) * PW;
  const yOf = (yen: number) => BASE - (yen / hi) * PH;
  const line = (key: "a" | "b") =>
    series.map((p) => `${xOf(p.year).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(" ");

  // 交点の累計コストは A の直線上の値(交点なので B と一致する)
  const beYen =
    breakEven === null
      ? null
      : series[0].a + ((series[1].a - series[0].a) * breakEven);

  const xStep = years > 10 ? 5 : years > 5 ? 2 : 1;
  const xTicks: number[] = [];
  for (let y = 0; y <= years; y += xStep) xTicks.push(y);

  const label =
    breakEven === null
      ? `${years}年以内に累計コストは逆転しません。`
      : `${formatNumber(breakEven, 1)}年で累計コストが逆転します。`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${nameA}と${nameB}の累計コスト比較。横軸は0〜${years}年、縦軸は累計コスト。${years}年時点で${nameA}が${man(
          series[series.length - 1].a
        )}円、${nameB}が${man(series[series.length - 1].b)}円。${label}`}
      >
        <text x="12" y="14" fontSize="11" fill="var(--ink-3)">
          累計コスト(円)
        </text>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={ML + PW} y1={yOf(t)} y2={yOf(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={ML - 8} y={yOf(t) + 4} fontSize="11" fill="var(--ink-3)" textAnchor="end">
              {man(t)}
            </text>
          </g>
        ))}

        <line x1={ML} x2={ML + PW} y1={BASE} y2={BASE} stroke="var(--baseline)" strokeWidth="1" />

        {xTicks.map((y) => (
          <text
            key={y}
            x={xOf(y)}
            y={VH - 22}
            fontSize="11"
            fill="var(--ink-3)"
            textAnchor="middle"
          >
            {y}年
          </text>
        ))}

        <polyline
          points={line("a")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          points={line("b")}
          fill="none"
          stroke="var(--chart-series2)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {breakEven !== null && beYen !== null && (
          <g>
            <line
              x1={xOf(breakEven)}
              x2={xOf(breakEven)}
              y1={MT}
              y2={BASE}
              stroke="var(--baseline)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <circle
              cx={xOf(breakEven)}
              cy={yOf(beYen)}
              r="4"
              fill="var(--ink-1)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            <text
              x={xOf(breakEven) + (breakEven > years * 0.7 ? -8 : 8)}
              y={yOf(beYen) - 10}
              fontSize="11"
              fontWeight="600"
              fill="var(--ink-1)"
              textAnchor={breakEven > years * 0.7 ? "end" : "start"}
            >
              損益分岐 {formatNumber(breakEven, 1)}年
            </text>
          </g>
        )}
      </svg>

      {/* 凡例。色だけに頼らせないため車両名をそのまま出す(DESIGN §5.10) */}
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-note text-ink-2">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--accent)" strokeWidth="2" />
          </svg>
          {nameA}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="4" x2="18" y2="4" stroke="var(--chart-series2)" strokeWidth="2" />
          </svg>
          {nameB}
        </span>
      </div>
    </div>
  );
}
