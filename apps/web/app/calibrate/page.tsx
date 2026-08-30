import type { Metadata } from "next";
import { listRoutes } from "@/lib/data";
import { CalibrateScreen } from "./_components/CalibrateScreen";

export const metadata: Metadata = {
  title: "じぶん補正(実測データで精度を上げる)| Regen",
  description:
    "手元の運行実績CSV(日付・走行距離・消費量)を読み込むと、推定モデルの車両効率・空調負荷の係数を実測に合わせて補正します。CSVはブラウザの中だけで処理し、サーバーには送信しません。",
};

/** 路線マスタはバッチ更新のとき以外変わらない */
export const revalidate = 3600;

export default async function CalibratePage() {
  // 突き合わせの土台にする路線を選ばせる。CSVそのものはこの画面に一切渡らない
  const routes = await listRoutes();
  return (
    <CalibrateScreen
      routes={routes.map((r) => ({
        id: r.id,
        name: r.name,
        agency: r.agency,
        lengthM: r.lengthM,
        tractionKwh: r.tractionKwh,
        regenKwh: r.regenKwh,
        kwhPerKm: r.kwhPerKm,
      }))}
    />
  );
}
