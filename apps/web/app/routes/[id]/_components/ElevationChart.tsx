"use client";

import { useRef, useState } from "react";
import { formatInt, formatKm, formatNumber } from "@/lib/format";

type CorrSegment = { startM: number; endM: number; maxCutM: number };

// プロトタイプ(docs/prototype/検証レポート_W1.html)と同じ座標系
const VW = 840;
const VH = 360;
const ML = 56; // 左余白(Y軸ラベル)
const MT = 28; // 上余白
const PW = VW - ML - 16;
const PH = 292;
const BASE = MT + PH; // 面の下端 y

function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
  return ticks;
}

export function ElevationChart({
  elev,
  stepM,
  lengthM,
  corrSegments,
  firstStop,
  lastStop,
  peakIdx,
  peakElevM,
  routeName,
}: {
  elev: number[];
  stepM: number;
  lengthM: number;
  corrSegments: CorrSegment[];
  firstStop: string;
  lastStop: string;
  peakIdx: number;
  /** 注記に出す最高標高。間引き前の値を使い、数値タイルと表示を揃える */
  peakElevM: number;
  routeName: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const emin = Math.min(...elev);
  const emax = Math.max(...elev);
  // 上下に1割ずつ余白をとって線が枠に貼り付かないようにする
  const pad = Math.max((emax - emin) * 0.1, 10);
  const lo = emin - pad;
  const hi = emax + pad;

  const xOf = (i: number) => ML + (i / (elev.length - 1)) * PW;
  const yOf = (e: number) => MT + PH - ((e - lo) / (hi - lo)) * PH;
  const distOf = (i: number) => Math.min(i * stepM, lengthM);

  const points = elev.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`).join(" ");
  const areaPath = `M ${xOf(0).toFixed(1)},${BASE} L ${points.replaceAll(" ", " L ")} L ${xOf(
    elev.length - 1
  ).toFixed(1)},${BASE} Z`;

  const yTicks = niceTicks(lo, hi);
  // 距離の目盛りはキリのいいkmに置く(1/2/5/10km刻みから選ぶ)
  const lengthKm = lengthM / 1000;
  const xStepKm = [1, 2, 5, 10].find((s) => lengthKm / s <= 8) ?? 20;
  const xTicks: number[] = [];
  for (let d = 0; d <= lengthKm + 1e-9; d += xStepKm) xTicks.push(d);

  // 補正区間は、範囲を示す帯 + 線の上に重ねた破線で示す。
  // 破線だけだと補正後の線と重なって見分けにくいため、帯で位置を掴めるようにする。
  const corrBands = corrSegments.map((s) => {
    const x1 = ML + (Math.min(s.startM, lengthM) / lengthM) * PW;
    const x2 = ML + (Math.min(s.endM, lengthM) / lengthM) * PW;
    return { x: x1, width: Math.max(x2 - x1, 2) };
  });
  const corrPaths = corrSegments.map((s) => {
    const from = Math.max(0, Math.floor(s.startM / stepM));
    const to = Math.min(elev.length - 1, Math.ceil(s.endM / stepM));
    const pts: string[] = [];
    for (let i = from; i <= to; i++) pts.push(`${xOf(i).toFixed(1)},${yOf(elev[i]).toFixed(1)}`);
    return pts.join(" ");
  });

  const annotations = [
    { i: 0, label: firstStop, anchor: "start" as const, dx: 8 },
    { i: peakIdx, label: `最高地点 ${formatInt(peakElevM)}m`, anchor: "middle" as const, dx: 0 },
    { i: elev.length - 1, label: lastStop, anchor: "end" as const, dx: -8 },
  ].filter((a, k, arr) => arr.findIndex((b) => b.i === a.i) === k);

  const gradeAt = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(elev.length - 1, i + 1);
    if (b === a) return 0;
    return ((elev[b] - elev[a]) / ((b - a) * stepM)) * 100;
  };

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) * VW) / r.width;
    if (vx < ML || vx > ML + PW) {
      setHover(null);
      return;
    }
    const i = Math.round(((vx - ML) / PW) * (elev.length - 1));
    const clamped = Math.min(Math.max(i, 0), elev.length - 1);
    setHover({ i: clamped, x: xOf(clamped), y: yOf(elev[clamped]) });
  };

  const tipLeft = hover ? Math.min(Math.max((hover.x / VW) * 100, 8), 82) : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-label={`${routeName}の標高プロファイル。起点${firstStop}(${formatInt(
          elev[0]
        )}m)から最高地点${formatInt(elev[peakIdx])}mを経て終点${lastStop}(${formatInt(
          elev[elev.length - 1]
        )}m)まで、全長${formatKm(lengthM / 1000)}km。`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <text x="12" y="18" fontSize="11" fill="var(--ink-3)">
          標高(m)
        </text>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={ML + PW} y1={yOf(t)} y2={yOf(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={ML - 8} y={yOf(t) + 4} fontSize="11" fill="var(--ink-3)" textAnchor="end">
              {formatInt(t)}
            </text>
          </g>
        ))}

        {corrBands.map((b, k) => (
          <rect key={k} x={b.x} y={MT} width={b.width} height={PH} fill="var(--ink-3)" opacity="0.1" />
        ))}

        <path d={areaPath} fill="var(--accent-weak)" opacity="0.45" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {corrPaths.map((pts, k) => (
          <polyline
            key={k}
            points={pts}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
        ))}

        <line x1={ML} x2={ML + PW} y1={BASE} y2={BASE} stroke="var(--baseline)" strokeWidth="1" />

        {xTicks.map((d) => (
          <text
            key={d}
            x={ML + (d / lengthKm) * PW}
            y={VH - 22}
            fontSize="11"
            fill="var(--ink-3)"
            textAnchor="middle"
          >
            {d}km
          </text>
        ))}

        {annotations.map((a) => (
          <g key={a.i}>
            <circle
              cx={xOf(a.i)}
              cy={yOf(elev[a.i])}
              r="4"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            <text
              x={xOf(a.i) + a.dx}
              y={yOf(elev[a.i]) - 10}
              fontSize="11"
              fontWeight="600"
              fill="var(--ink-2)"
              textAnchor={a.anchor}
            >
              {a.label}
            </text>
          </g>
        ))}

        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={MT}
              y2={BASE}
              stroke="var(--baseline)"
              strokeWidth="1"
            />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-line bg-surface px-2 py-1 text-note shadow-card"
          style={{ left: `${tipLeft}%` }}
        >
          <b className="tabular-nums">{formatKm(distOf(hover.i) / 1000)} km</b> — 標高{" "}
          <span className="tabular-nums">{formatInt(elev[hover.i])}</span> m
          <br />
          <span className="text-ink-2">
            勾配{" "}
            <span className="tabular-nums">
              {gradeAt(hover.i) >= 0 ? "+" : ""}
              {formatNumber(gradeAt(hover.i), 1)}
            </span>{" "}
            %
          </span>
        </div>
      )}

      {corrSegments.length > 0 && (
        <p className="mt-2 flex items-center gap-2 text-note text-ink-3">
          <svg width="28" height="10" aria-hidden="true" className="shrink-0">
            <rect x="0" y="0" width="28" height="10" fill="var(--ink-3)" opacity="0.1" />
            <line
              x1="0"
              y1="5"
              x2="28"
              y2="5"
              stroke="var(--ink-3)"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
          </svg>
          帯と破線の区間はトンネル・高架として補正しています(下記「診断の精度と補正」参照)
        </p>
      )}
    </div>
  );
}
