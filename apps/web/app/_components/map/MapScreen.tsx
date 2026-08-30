"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { FilterRow } from "@/app/_components/FilterRow";
import type { Verdict } from "@/app/_components/verdict";
import { VERDICTS } from "@/app/_components/verdict";
import { isDefaultThresholds, isIdentity, type Thresholds } from "@regen/core";
import { calibrateRoute } from "@/lib/calibrated";
import { useActiveCalibration } from "@/app/_components/calibration/CalibrationProvider";
import { CalibrationBanner } from "@/app/_components/calibration/CalibrationBanner";
import { Legend } from "./Legend";
import { RouteSummary } from "./RouteSummary";
import {
  EMPTY_FILTERS,
  matchesFilters,
  type MapFilters,
  type RouteCollection,
  type RouteProps,
} from "./types";

// MapLibreはSSR不可(§: CLAUDE.md Server/Client境界)
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-grid" />,
});

const ACCURACY_LABELS: Record<string, string> = {
  A: "A(実形状)",
  B: "B(停留所近似)",
};

export function MapScreen({ thresholds }: { thresholds: Thresholds }) {
  const [data, setData] = useState<RouteCollection | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<RouteProps | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const calib = useActiveCalibration();

  // R2の現行バンドル(bundles/<version>/routes.json)をWorker経由で取る。
  // どの版を返すかは D1 の bundles.is_current が決めるので、ここは版を意識しない
  useEffect(() => {
    let cancelled = false;
    fetch("/api/map", { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`地図データの取得に失敗しました(HTTP ${res.status})`);
        return res.json() as Promise<RouteCollection>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (loadError) throw loadError; // app/error.tsx で処理

  /**
   * じぶん補正(F-4)を当てたfeature。無補正なら元のオブジェクトをそのまま返すので、
   * 参照が変わらず MapLibre のソース更新も起きない。
   */
  const shown = useMemo(() => {
    if (!data || (isIdentity(calib) && isDefaultThresholds(thresholds))) return data;
    return {
      ...data,
      features: data.features.map((f) => {
        const p = f.properties;
        const c = calibrateRoute(
          {
            verdict: p.verdict,
            kwhPerKm: p.ew / p.L,
            roundtripBattPct: p.batt,
            dailyKwh: p.ew * p.trips,
            extraCharges: p.charges,
            tractionKwh: p.etr,
            regenKwh: p.regen,
            winterKwh: p.ew,
            lengthKm: p.L,
            tripsPerDay: p.trips,
            maxGrade: p.mg,
          },
          calib,
          thresholds
        );
        return {
          ...f,
          properties: {
            ...p,
            batt: Math.round(c.roundtripBattPct),
            charges: c.extraCharges,
            verdict: c.verdict as Verdict,
          },
        };
      }),
    } satisfies RouteCollection;
  }, [data, calib, thresholds]);

  const agencies = useMemo(() => {
    if (!shown) return [];
    return [...new Set(shown.features.map((f) => f.properties.agency))];
  }, [shown]);

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { 適: 0, 条件付き: 0, 要検討: 0 };
    if (!shown) return c;
    for (const f of shown.features) {
      if (matchesFilters(f.properties, filters)) c[f.properties.verdict] += 1;
    }
    return c;
  }, [shown, filters]);

  const changeFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    // 絞り込みで対象外になった選択は解除する
    if (selected && !matchesFilters(selected, next)) setSelected(null);
  };

  return (
    <div className="flex h-[calc(100dvh-48px)] min-h-[480px] flex-col">
      <div className="border-b border-line bg-surface px-4 py-2">
        <div className="[&>div]:mb-2">
          <CalibrationBanner />
        </div>
        <FilterRow
          filters={[
            {
              key: "agency",
              label: "事業者",
              value: filters.agency,
              options: agencies.map((a) => ({ value: a, label: a })),
            },
            {
              key: "verdict",
              label: "判定",
              value: filters.verdict,
              options: (Object.keys(VERDICTS) as Verdict[]).map((v) => ({
                value: v,
                label: `${VERDICTS[v].symbol} ${v}`,
              })),
            },
            {
              key: "accuracy",
              label: "精度ランク",
              value: filters.accuracy,
              options: ["A", "B"].map((a) => ({ value: a, label: ACCURACY_LABELS[a] })),
            },
          ]}
          onChange={changeFilter}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
      </div>
      <div className="relative min-h-0 flex-1">
        {shown ? (
          <MapView
            data={shown}
            filters={filters}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            popupEnabled={!isMobile}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-grid" />
        )}
        <div className="absolute bottom-8 left-3 z-10">
          <Legend counts={counts} />
        </div>
        {isMobile && selected && shown && (
          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-card border-t border-line bg-surface shadow-card">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-2 top-2 rounded-btn px-2 py-1 text-aux text-ink-3"
              aria-label="閉じる"
            >
              ✕
            </button>
            <RouteSummary route={shown.features.find((f) => f.properties.id === selected.id)?.properties ?? selected} />
          </div>
        )}
      </div>
    </div>
  );
}
