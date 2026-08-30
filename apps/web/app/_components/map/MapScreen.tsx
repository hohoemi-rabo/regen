"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { FilterRow } from "@/app/_components/FilterRow";
import type { Verdict } from "@/app/_components/verdict";
import { VERDICTS } from "@/app/_components/verdict";
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

export function MapScreen() {
  const [data, setData] = useState<RouteCollection | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<RouteProps | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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

  const agencies = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.features.map((f) => f.properties.agency))];
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { 適: 0, 条件付き: 0, 要検討: 0 };
    if (!data) return c;
    for (const f of data.features) {
      if (matchesFilters(f.properties, filters)) c[f.properties.verdict] += 1;
    }
    return c;
  }, [data, filters]);

  const changeFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    // 絞り込みで対象外になった選択は解除する
    if (selected && !matchesFilters(selected, next)) setSelected(null);
  };

  return (
    <div className="flex h-[calc(100dvh-48px)] min-h-[480px] flex-col">
      <div className="border-b border-line bg-surface px-4 py-2">
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
        {data ? (
          <MapView
            data={data}
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
        {isMobile && selected && (
          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-card border-t border-line bg-surface shadow-card">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-2 top-2 rounded-btn px-2 py-1 text-aux text-ink-3"
              aria-label="閉じる"
            >
              ✕
            </button>
            <RouteSummary route={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
