"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { useCalibration } from "./CalibrationProvider";

/**
 * 「じぶん補正 適用中」の帯(F-4-5)。
 * 画面の数値が既定の推定モデルではないことを、数値の近くで常に分かるようにする。
 * 印刷には出さない(紙には「仮定」節に係数を書く)。
 */
export function CalibrationBanner() {
  const { calibration, clear } = useCalibration();
  if (!calibration) return null;

  const parts = [
    `車両効率 ×${formatNumber(calibration.kDrive, 2)}`,
    calibration.kAux !== 1 ? `空調 ×${formatNumber(calibration.kAux, 2)}` : null,
    calibration.kmPerL !== null ? `実燃費 ${formatNumber(calibration.kmPerL, 1)} km/L` : null,
  ].filter(Boolean);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-accent bg-accent-weak px-3 py-2 text-note print:hidden">
      <span className="font-semibold text-ink-1">じぶん補正 適用中</span>
      <span className="text-ink-2">{parts.join(" / ")}</span>
      <Link href="/calibrate" className="font-semibold text-accent hover:text-accent-strong">
        補正を見直す
      </Link>
      <button
        type="button"
        onClick={clear}
        className="ml-auto font-semibold text-accent hover:text-accent-strong"
      >
        補正を解除
      </button>
    </div>
  );
}
