"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CO2,
  DEFAULT_EV,
  SUMMER_AUX_W,
  WINTER_AUX_W,
  breakEvenYear,
  cruiseSpeedKmh,
  simulateVehicle,
  tcoSeries,
  type ScenarioParams,
  type SimInput,
  type Vehicle,
} from "@regen/core";
import { ShareButton } from "./ShareButton";
import { formatInt, formatKm, formatNumber } from "@/lib/format";
import { Bar, DefinitionRow, Section } from "../../_components/sections";
import { NumberField } from "./NumberField";
import { Slider } from "./Slider";
import { TcoChart } from "./TcoChart";
import { VehicleColumn } from "./VehicleColumn";

/** TCOの評価期間。バスの標準的な使用年数(要件§13-5の判断) */
const TCO_YEARS = 15;
/** 年間運行日数の既定。平日ダイヤ相当。事業者ごとに違うので入力で変えられる */
const DEFAULT_ANNUAL_DAYS = 250;

/** 車種を選び直したときに、その車種の値へ戻す項目 */
function defaultsOf(v: Vehicle) {
  return {
    massKg: v.massKg,
    batteryKwh: v.batteryKwh ?? DEFAULT_EV.batteryKwh,
    priceYen: v.priceYen ?? 0,
    subsidyYen: v.subsidyYen ?? 0,
  };
}

export function CompareScreen({
  routeId,
  routeName,
  agency,
  bundleVersion,
  vehicles,
  elev25,
  lengthM,
  gmax,
  tripsPerDay,
  repDayLabel,
  repTrips,
  totalTrips,
  arrivals,
}: {
  routeId: string;
  routeName: string;
  agency: string;
  /** 配信中の診断バンドル版。保存するシナリオに記録する(F-6) */
  bundleVersion: string;
  /** 車両マスタ。D1が正本で、サーバーから渡ってくる(チケット06) */
  vehicles: Vehicle[];
  /** 25m間隔の補正後標高。診断書と同じ数値を再現できる唯一の入力 */
  elev25: number[];
  lengthM: number;
  /** 最急勾配(分数) */
  gmax: number;
  tripsPerDay: number;
  repDayLabel: string;
  repTrips: number;
  totalTrips: number;
  arrivals: string[];
}) {
  // 既定は「診断書と同じ前提の基準車」×「ディーゼル」。無ければ先頭2件
  const initialA = vehicles.find((v) => v.id === "standard-ev") ?? vehicles[0];
  const initialB = vehicles.find((v) => v.powertrain === "diesel") ?? vehicles[1] ?? vehicles[0];
  const [aId, setAId] = useState(initialA.id);
  const [bId, setBId] = useState(initialB.id);
  const [a, setA] = useState(() => defaultsOf(initialA));
  const [b, setB] = useState(() => defaultsOf(initialB));
  const [auxW, setAuxW] = useState(WINTER_AUX_W);
  const [yenPerKwh, setYenPerKwh] = useState(30);
  const [yenPerLiterDiesel, setYenPerLiterDiesel] = useState(165);
  const [annualDays, setAnnualDays] = useState(DEFAULT_ANNUAL_DAYS);

  const vehA = vehicles.find((v) => v.id === aId) ?? initialA;
  const vehB = vehicles.find((v) => v.id === bId) ?? initialB;
  const lengthKm = lengthM / 1000;

  const sim = useMemo(() => {
    const t0 = performance.now();
    const input: SimInput = {
      elev: elev25, lengthM, gmax, tripsPerDay, arrivals, auxW, yenPerKwh, yenPerLiterDiesel,
    };
    const ra = simulateVehicle(vehA, { massKg: a.massKg, batteryKwh: a.batteryKwh }, input);
    const rb = simulateVehicle(vehB, { massKg: b.massKg, batteryKwh: b.batteryKwh }, input);
    // F-3-2の受入条件(300ms以内)の実測。本番ビルドでは出さない
    if (process.env.NODE_ENV !== "production") {
      console.log(`F-3 再計算: ${(performance.now() - t0).toFixed(2)}ms (${elev25.length}点 × 2車両)`);
    }
    return { ra, rb };
  }, [elev25, lengthM, gmax, tripsPerDay, arrivals, auxW, yenPerKwh, yenPerLiterDiesel,
      vehA, vehB, a.massKg, a.batteryKwh, b.massKg, b.batteryKwh]);

  const { ra, rb } = sim;
  const annualKm = lengthKm * tripsPerDay * annualDays;
  const tco = {
    initialYenA: Math.max(0, a.priceYen - a.subsidyYen),
    initialYenB: Math.max(0, b.priceYen - b.subsidyYen),
    annualYenA: ra.dayYen * annualDays,
    annualYenB: rb.dayYen * annualDays,
    years: TCO_YEARS,
  };
  const series = useMemo(() => tcoSeries(tco), [tco.initialYenA, tco.initialYenB, tco.annualYenA, tco.annualYenB]);
  const be = breakEvenYear(tco);
  // 定価を持たない車種(標準EVバス等)は0円のまま。0円同士の比較は損益分岐に意味がない
  const needsPrice = a.priceYen <= 0 || b.priceYen <= 0;

  const yenDiff = rb.dayYen - ra.dayYen;   // 正なら車両Aが安い
  const co2Diff = rb.dayCo2Kg - ra.dayCo2Kg;
  const maxYen = Math.max(ra.dayYen, rb.dayYen, 1);
  const maxCo2 = Math.max(ra.dayCo2Kg, rb.dayCo2Kg, 1);

  const diffText = (diff: number, unit: string, digits: number, cheaper: string, dearer: string) => {
    if (Math.abs(diff) < Math.pow(10, -digits) / 2) return `車両Aと車両Bで差はありません`;
    const v = formatNumber(Math.abs(diff), digits);
    return diff > 0
      ? `車両A のほうが ▼ ${v} ${unit} ${cheaper}`
      : `車両B のほうが ▼ ${v} ${unit} ${dearer}`;
  };

  /**
   * 保存するシナリオ(F-6)。**選択中の車両スペックを丸ごと控える。**
   * IDだけ保存すると、後で車両マスタが更新されたときに共有URLの数字が動いてしまう。
   */
  const scenarioParams = (): ScenarioParams => ({
    v: 1,
    routeId,
    bundleVersion,
    a: { vehicle: vehA, massKg: a.massKg, batteryKwh: a.batteryKwh, priceYen: a.priceYen, subsidyYen: a.subsidyYen },
    b: { vehicle: vehB, massKg: b.massKg, batteryKwh: b.batteryKwh, priceYen: b.priceYen, subsidyYen: b.subsidyYen },
    auxW, yenPerKwh, yenPerLiterDiesel, annualDays, tcoYears: TCO_YEARS,
  });

  const pick = (id: string) => vehicles.find((v) => v.id === id) ?? initialA;
  const pickA = (id: string) => { setAId(id); setA(defaultsOf(pick(id))); };
  const pickB = (id: string) => { setBId(id); setB(defaultsOf(pick(id))); };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <nav className="mb-4 text-note text-ink-3">
        <Link href="/routes" className="text-accent hover:text-accent-strong">路線一覧</Link>
        <span className="mx-1">/</span>
        <Link href={`/routes/${routeId}`} className="text-accent hover:text-accent-strong">{routeName}</Link>
        <span className="mx-1">/</span>
        車両比較
      </nav>

      <h1 className="text-page-title">車両比較 — {routeName}</h1>
      <p className="mt-1 text-aux text-ink-2">
        {agency} / 片道 {formatKm(lengthKm)} km / {repDayLabel}ダイヤ {tripsPerDay} 便
        / 最急勾配 {formatNumber(gmax * 100, 1)} %
        {repTrips !== totalTrips && `(GTFSの全ダイヤ合計は ${totalTrips} 便)`}
      </p>

      <div className="mt-card-gap space-y-card-gap">
        <Section
          title="共通の条件"
          caption="両方の車両に同じ値で効きます。動かすとその場で再計算します。"
        >
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Slider
              label="空調負荷" value={auxW} min={0} max={10000} step={500} unit="kW"
              display={formatNumber(auxW / 1000, 1)} defaultValue={WINTER_AUX_W} onChange={setAuxW}
            />
            <Slider
              label="電力単価" value={yenPerKwh} min={10} max={60} step={1} unit="円/kWh"
              defaultValue={30} onChange={setYenPerKwh}
            />
            <Slider
              label="軽油単価" value={yenPerLiterDiesel} min={100} max={250} step={5} unit="円/L"
              defaultValue={165} onChange={setYenPerLiterDiesel}
            />
          </div>
          <p className="mt-2 text-note text-ink-3">
            空調は冬 {WINTER_AUX_W / 1000} kW(診断書と同じ)/ 夏 {SUMMER_AUX_W / 1000} kW。
            年平均に近づけたい場合は 5〜6 kW あたりが目安です。
          </p>
        </Section>

        <div className="grid gap-card-gap md:grid-cols-2">
          <VehicleColumn
            side="A" vehicles={vehicles} vehicle={vehA} massKg={a.massKg} batteryKwh={a.batteryKwh}
            result={ra} repDayLabel={repDayLabel}
            onVehicleChange={pickA}
            onMassChange={(v) => setA((s) => ({ ...s, massKg: v }))}
            onBatteryChange={(v) => setA((s) => ({ ...s, batteryKwh: v }))}
          />
          <VehicleColumn
            side="B" vehicles={vehicles} vehicle={vehB} massKg={b.massKg} batteryKwh={b.batteryKwh}
            result={rb} repDayLabel={repDayLabel}
            onVehicleChange={pickB}
            onMassChange={(v) => setB((s) => ({ ...s, massKg: v }))}
            onBatteryChange={(v) => setB((s) => ({ ...s, batteryKwh: v }))}
          />
        </div>

        <Section title="1日あたりの差" caption={`${repDayLabel}ダイヤ ${tripsPerDay} 便を1台で走らせた場合。`}>
          <p className="text-aux font-semibold text-ink-2">燃料・電力費</p>
          <div className="mt-2 space-y-2">
            {/* Bar の variant は系列色の指定。ev=青(車両A) / diesel=橙(車両B) */}
            <Bar label="車両A" value={ra.dayYen} max={maxYen} display={`${formatInt(ra.dayYen)}円`} />
            <Bar label="車両B" value={rb.dayYen} max={maxYen} display={`${formatInt(rb.dayYen)}円`} variant="diesel" />
          </div>
          <p className="mt-2 text-body">
            <strong className="tabular-nums">{diffText(yenDiff, "円/日", 0, "安い", "安い")}</strong>
            {Math.abs(yenDiff) >= 0.5 && (
              <span className="text-ink-2">(年間 {formatInt(Math.abs(yenDiff) * annualDays)}円)</span>
            )}
          </p>

          <p className="mt-5 text-aux font-semibold text-ink-2">CO2排出</p>
          <div className="mt-2 space-y-2">
            <Bar label="車両A" value={ra.dayCo2Kg} max={maxCo2} display={`${formatNumber(ra.dayCo2Kg, 1)} kg`} />
            <Bar label="車両B" value={rb.dayCo2Kg} max={maxCo2} display={`${formatNumber(rb.dayCo2Kg, 1)} kg`} variant="diesel" />
          </div>
          <p className="mt-2 text-body">
            <strong className="tabular-nums">{diffText(co2Diff, "kg-CO2/日", 1, "少ない", "少ない")}</strong>
          </p>
          <p className="mt-2 text-note text-ink-3">
            EV側も発電に伴うCO2({CO2.gridKgPerKwh} kg-CO2/kWh・全国平均相当)を計上しています。
            軽油は {CO2.dieselKgPerL} kg-CO2/L(温対法 算定・報告・公表制度の標準値)。
          </p>
        </Section>

        <Section
          title="TCO(総保有コスト)"
          caption={`車両価格 − 補助金 + エネルギー費の累計。整備費・充電器設置費・人件費は含みません。`}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              label={`車両価格 A(${vehA.name})`} value={a.priceYen} unit="円" step={100000}
              onChange={(v) => setA((s) => ({ ...s, priceYen: v }))}
            />
            <NumberField
              label="補助金 A" value={a.subsidyYen} unit="円" step={100000}
              onChange={(v) => setA((s) => ({ ...s, subsidyYen: v }))}
            />
            <NumberField
              label={`車両価格 B(${vehB.name})`} value={b.priceYen} unit="円" step={100000}
              onChange={(v) => setB((s) => ({ ...s, priceYen: v }))}
            />
            <NumberField
              label="補助金 B" value={b.subsidyYen} unit="円" step={100000}
              onChange={(v) => setB((s) => ({ ...s, subsidyYen: v }))}
            />
            <NumberField
              label="年間運行日数" value={annualDays} unit="日" min={1} max={365}
              hint={`年間走行距離 ${formatInt(annualKm)} km`}
              onChange={setAnnualDays}
            />
          </div>

          <div className="mt-5">
            <TcoChart series={series} years={TCO_YEARS} breakEven={be} nameA={vehA.name} nameB={vehB.name} />
          </div>

          <div className="mt-4 border-t border-grid pt-4">
            {needsPrice ? (
              <p className="text-body">
                <strong>車両価格を入力すると損益分岐年数が出ます。</strong>
                {" "}
                {a.priceYen <= 0 && `車両A(${vehA.name})`}
                {a.priceYen <= 0 && b.priceYen <= 0 && " と "}
                {b.priceYen <= 0 && `車両B(${vehB.name})`}
                の価格が未入力です。車両マスタに定価のない車種は、実際の見積額を入れてください。
              </p>
            ) : be === null ? (
              <p className="text-body">
                この条件では <strong>{TCO_YEARS}年以内に累計コストは逆転しません</strong>。
                車両価格・補助金・単価を変えて分岐点を探せます。
              </p>
            ) : (
              <>
                <p className="text-aux text-ink-2">損益分岐年数</p>
                <p className="text-hero leading-none">
                  {formatNumber(be, 1)}
                  <span className="ml-1 text-body font-normal text-ink-2">年</span>
                </p>
                <p className="mt-2 text-aux text-ink-2">
                  {tco.initialYenA > tco.initialYenB
                    ? `車両A(${vehA.name})は初期費用が ${formatInt(tco.initialYenA - tco.initialYenB)}円 高いものの、`
                    : `車両B(${vehB.name})は初期費用が ${formatInt(tco.initialYenB - tco.initialYenA)}円 高いものの、`}
                  エネルギー費の差で {formatNumber(be, 1)} 年後に累計コストが逆転します。
                </p>
              </>
            )}
          </div>
        </Section>

        <Section title="試算の仮定" caption="この画面の数値はすべて次の値から計算しています。">
          <dl>
            <DefinitionRow label="空調負荷" value={`${formatNumber(auxW / 1000, 1)} kW`} />
            <DefinitionRow label="単価" value={`電力 ${yenPerKwh} 円/kWh / 軽油 ${yenPerLiterDiesel} 円/L`} />
            <DefinitionRow label="表定速度" value={`${cruiseSpeedKmh(lengthM)} km/h`} />
            <DefinitionRow label="電池の使用可能割合" value={`${Math.round(DEFAULT_EV.usableRatio * 100)} %(全車共通)`} />
            <DefinitionRow
              label="年間走行距離"
              value={`${formatKm(lengthKm)} km × ${tripsPerDay} 便 × ${annualDays} 日 = ${formatInt(annualKm)} km`}
            />
            <DefinitionRow label="TCOの評価期間" value={`${TCO_YEARS} 年`} />
            <DefinitionRow label="TCOに含めない費目" value="整備費・充電器設置費・人件費・税保険" />
            <DefinitionRow label="勾配プロファイル" value="25m間隔・補正後(診断書と同一)" />
          </dl>

          <p className="mt-4 text-aux font-semibold text-ink-2">車両マスタの出典</p>
          <dl className="mt-1">
            {vehicles.map((v) => (
              <div key={v.id} className="border-b border-grid py-2 last:border-b-0">
                <dt className="text-aux font-semibold">
                  {v.name}
                  {v.sourceUrl && (
                    <a
                      href={v.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-note font-normal text-accent hover:text-accent-strong"
                    >
                      出典 ↗
                    </a>
                  )}
                </dt>
                <dd className="text-note text-ink-3">{v.note}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-note text-ink-3">
            車両マスタは暫定です(要件定義書§13-1)。実車の値が分かる場合は、スライダーと入力欄で
            上書きして試算してください。
          </p>
        </Section>

        <ShareButton params={scenarioParams} />

        <div>
          <Link href={`/routes/${routeId}`} className="text-body font-semibold text-accent hover:text-accent-strong">
            ← 診断書に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
