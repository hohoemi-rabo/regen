import type { Metadata } from "next";
import { MapScreen } from "./_components/map/MapScreen";

export const metadata: Metadata = {
  title: "南信州EV適性マップ | Regen",
  description:
    "南信州46路線のバスEV化適性を地図で色分け表示。路線ごとの冬季往復バッテリー使用率・追加充電回数から診断書へ。",
  openGraph: {
    title: "南信州EV適性マップ | Regen",
    description: "路線バスのEV化適性を、公共交通オープンデータと標高データだけで診断。",
  },
};

export default function Home() {
  return <MapScreen />;
}
