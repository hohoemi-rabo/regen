import type { Feature, FeatureCollection, LineString } from "geojson";
import type { Verdict } from "@/app/_components/verdict";

/** R2 `bundles/<version>/routes.json` のFeature properties(batch/src/seed-map.ts が生成) */
export type RouteProps = {
  id: string;
  name: string;
  agency: string;
  verdict: Verdict;
  /** 精度ランク: A=実形状 / B=停留所近似 */
  accuracy: "A" | "B";
  /** 路線長 km */
  L: number;
  /** 便/日 */
  trips: number;
  /** 冬季往復バッテリー使用率 % */
  batt: number;
  /** 追加充電回数/日 */
  charges: number;
};

export type RouteFeature = Feature<LineString, RouteProps>;
export type RouteCollection = FeatureCollection<LineString, RouteProps>;

export type MapFilters = {
  agency: string;
  verdict: string;
  accuracy: string;
};

export const EMPTY_FILTERS: MapFilters = { agency: "", verdict: "", accuracy: "" };

export function matchesFilters(p: RouteProps, f: MapFilters): boolean {
  return (
    (f.agency === "" || p.agency === f.agency) &&
    (f.verdict === "" || p.verdict === f.verdict) &&
    (f.accuracy === "" || p.accuracy === f.accuracy)
  );
}
