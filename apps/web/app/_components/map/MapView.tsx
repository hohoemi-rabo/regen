"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createRoot, type Root } from "react-dom/client";
import { RouteSummary } from "./RouteSummary";
import type { MapFilters, RouteCollection, RouteProps } from "./types";

const SRC = "routes";
const CASING = "routes-casing";
const LINE = "routes-line";
const HIT = "routes-hit"; // 細い線でもクリックできるよう透明の当たり判定層

/** :root のデザイントークンを読む(MapLibreスタイルに生hexを書かない) */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildFilter(f: MapFilters): maplibregl.FilterSpecification {
  const conds: unknown[] = ["all"];
  if (f.agency) conds.push(["==", ["get", "agency"], f.agency]);
  if (f.verdict) conds.push(["==", ["get", "verdict"], f.verdict]);
  if (f.accuracy) conds.push(["==", ["get", "accuracy"], f.accuracy]);
  return conds as maplibregl.FilterSpecification;
}

function bounds(data: RouteCollection): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds();
  for (const f of data.features) for (const c of f.geometry.coordinates) b.extend(c as [number, number]);
  return b;
}

export default function MapView({
  data,
  filters,
  selectedId,
  onSelect,
  popupEnabled,
}: {
  data: RouteCollection;
  filters: MapFilters;
  selectedId: string | null;
  onSelect: (route: RouteProps | null) => void;
  /** デスクトップのみtrue。falseの場合は親が下部シートを出す */
  popupEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const clickLngLatRef = useRef<maplibregl.LngLat | null>(null);
  const popupRef = useRef<{ popup: maplibregl.Popup; root: Root } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 地図の初期化(1回)
  useEffect(() => {
    if (!containerRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          gsi: {
            type: "raster",
            tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 18,
            attribution:
              '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a> / <a href="https://gtfs-data.jp/" target="_blank" rel="noopener">GTFSデータリポジトリ</a>',
          },
        },
        layers: [
          {
            id: "gsi",
            type: "raster",
            source: "gsi",
            // §7.2 彩度を落とし、路線の色を立たせる
            paint: { "raster-saturation": -0.6 },
          },
        ],
      },
      bounds: bounds(data),
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: false },
    });
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource(SRC, { type: "geojson", data });
      // §7.1 白縁取り5px/55% + 判定色2.6px(選択中5px)
      map.addLayer({
        id: CASING,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": token("--ink-on-dark"),
          "line-width": 5,
          "line-opacity": 0.55,
        },
      });
      map.addLayer({
        id: LINE,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "verdict"],
            "適", token("--verdict-ok"),
            "条件付き", token("--verdict-cond"),
            "要検討", token("--verdict-ng"),
            token("--baseline"),
          ],
          "line-width": 2.6,
        },
      });
      map.addLayer({
        id: HIT,
        type: "line",
        source: SRC,
        paint: { "line-width": 14, "line-opacity": 0 },
      });

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: [HIT] });
        if (hits.length > 0) {
          clickLngLatRef.current = e.lngLat;
          onSelectRef.current(hits[0].properties as RouteProps);
        } else {
          onSelectRef.current(null);
        }
      });
      map.on("mousemove", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: [HIT] });
        map.getCanvas().style.cursor = hits.length > 0 ? "pointer" : "";
      });

      // 初期表示: 南信州全域(§8: 400ms)
      map.fitBounds(bounds(data), { padding: 40, duration: reduced ? 0 : 400 });
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // dataは初回ロード後不変(静的アセット)。作り直しはしない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フィルタの適用(残った路線の色は判定固定 — §5.7)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const f = buildFilter(filters);
      for (const layer of [CASING, LINE, HIT]) map.setFilter(layer, f);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [filters]);

  // 選択中路線の強調(本体5px)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setPaintProperty(LINE, "line-width", [
        "case",
        ["==", ["get", "id"], selectedId ?? ""],
        5,
        2.6,
      ]);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [selectedId]);

  // デスクトップのポップアップ(モバイルは親の下部シート)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (popupRef.current) {
      const { popup, root } = popupRef.current;
      popupRef.current = null;
      popup.remove();
      setTimeout(() => root.unmount(), 0);
    }
    if (!popupEnabled || !selectedId) return;
    const feature = data.features.find((f) => f.properties.id === selectedId);
    if (!feature) return;
    const el = document.createElement("div");
    const root = createRoot(el);
    root.render(<RouteSummary route={feature.properties} />);
    const lngLat =
      clickLngLatRef.current ?? (feature.geometry.coordinates[0] as [number, number]);
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "320px", offset: 8 })
      .setDOMContent(el)
      .setLngLat(lngLat)
      .addTo(map);
    popup.on("close", () => {
      if (popupRef.current?.popup === popup) onSelectRef.current(null);
    });
    popupRef.current = { popup, root };
  }, [popupEnabled, selectedId, data]);

  return <div ref={containerRef} className="h-full w-full" aria-label="EV適性マップ" />;
}
