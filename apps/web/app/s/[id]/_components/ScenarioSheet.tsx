import Link from "next/link";
import {
  CO2,
  DEFAULT_EV,
  breakEvenYear,
  cruiseSpeedKmh,
  simulateVehicle,
  tcoSeries,
  type ScenarioParams,
  type SimInput,
  type SimResult,
  type ScenarioSide,
} from "@regen/core";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { isVerdict } from "@/app/_components/verdict";
import { formatInt, formatKm, formatKwhPerKm, formatNumber } from "@/lib/format";
import { Bar, DefinitionRow, Section } from "@/app/routes/[id]/_components/sections";
import { TcoChart } from "@/app/routes/[id]/compare/_components/TcoChart";

const DASH = "—";

/** 保存された条件の1車両分。読み取り専用なのでセレクタもスライダーも置かない */
function VehiclePanel({
  side,
  input,
  result,
  repDayLabel,
}: {
  side: "A" | "B";
  input: ScenarioSide;
  result: SimResult;
  repDayLabel: string;
}) {
  const v = input.vehicle;
  const isEv = v.powertrain === "ev";
  const dot = side === "A" ? "bg-accent" : "bg-chart-series2";
  return (
    <div className="flex-1 rounded-tile border border-line bg-surface p-4 print:border-0 print:p-1">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-aux text-ink-2">車両{side}</span>
      </div>
      <p className="mt-0.5 text-section">{v.name}</p>

      <dl className="mt-2">
        <DefinitionRow
          label={isEv ? "電池容量" : "燃費"}
          value={isEv ? `${formatNumber(input.batteryKwh, 1)} kWh` : `${formatNumber(v.fuelKmPerL ?? 0, 1)} km/L`}
        />
        <DefinitionRow label="車両総重量" value={`${formatInt(input.massKg)} kg`} />
        <DefinitionRow
          label="電費"
          value={isEv ? `${formatKwhPerKm(result.kwhPerKm!)} kWh/km` : DASH}
        />
        <DefinitionRow
          label="往復バッテリー使用率"
          value={isEv ? `${formatInt(result.roundtripBattPct!)} %` : DASH}
        />
        <DefinitionRow
          label="追加充電"
          value={isEv && !result.infeasible ? `${result.extraCharges} 回/日` : DASH}
        />
        <DefinitionRow
          label={isEv ? "必要電力量" : "軽油消費量"}
          value={
            isEv
              ? `${formatInt(result.dayKwh!)} kWh/日`
              : `${formatNumber(result.dayLiters!, 1)} L/日`
          }
        />
        <DefinitionRow label="燃料・電力費" value={`${formatInt(result.dayYen)} 円/日`} />
        <DefinitionRow label="CO2排出" value={`${formatNumber(result.dayCo2Kg, 1)} kg/日`} />
        <DefinitionRow label="車両価格" value={input.priceYen > 0 ? `${formatInt(input.priceYen)} 円` : "未入力"} />
        <DefinitionRow label="補助金" value={`${formatInt(input.subsidyYen)} 円`} />
      </dl>

      {isEv && result.verdict && (
        <p className="mt-2 flex items-center gap-2 text-aux">
          <span className="text-ink-2">この条件での判定</span>
          {isVerdict(result.verdict) && <VerdictChip verdict={result.verdict} />}
        </p>
      )}
      {result.infeasible && (
        <p className="mt-2 text-note text-ink-2">
          <strong>この条件では1便を走り切れません。</strong>
          片道{formatNumber(result.kwhPerTrip ?? 0, 1)} kWh に対し使用可能は
          {formatNumber(input.batteryKwh * DEFAULT_EV.usableRatio, 1)} kWh({repDayLabel}ダイヤ)。
        </p>
      )}
    </div>
  );
}

/**
 * 共有シナリオの本体(F-6)。**読み取り専用の記録**。
 *
 * 数値は保存されたスナップショットからサーバーで再計算する。車両スペックも
 * 保存時の値を使うので、車両マスタや診断バンドルが更新されても表示は動かない。
 */
export function ScenarioSheet({
  id,
  params,
  createdAt,
  routeName,
  agency,
  lengthM,
  repDayLabel,
  repTrips,
  elev25,
  gmax,
  arrivals,
}: {
  id: string;
  params: ScenarioParams;
  createdAt: number;
  routeName: string;
  agency: string;
  lengthM: number;
  repDayLabel: string;
  repTrips: number;
  elev25: number[];
  gmax: number;
  arrivals: string[];
}) {
  const lengthKm = lengthM / 1000;
  const input: SimInput = {
    elev: elev25,
    lengthM,
    gmax,
    tripsPerDay: repTrips,
    arrivals,
    auxW: params.auxW,
    yenPerKwh: params.yenPerKwh,
    yenPerLiterDiesel: params.yenPerLiterDiesel,
  };
  const ra = simulateVehicle(params.a.vehicle, { massKg: params.a.massKg, batteryKwh: params.a.batteryKwh }, input);
  const rb = simulateVehicle(params.b.vehicle, { massKg: params.b.massKg, batteryKwh: params.b.batteryKwh }, input);

  const annualKm = lengthKm * repTrips * params.annualDays;
  const tco = {
    initialYenA: Math.max(0, params.a.priceYen - params.a.subsidyYen),
    initialYenB: Math.max(0, params.b.priceYen - params.b.subsidyYen),
    annualYenA: ra.dayYen * params.annualDays,
    annualYenB: rb.dayYen * params.annualDays,
    years: params.tcoYears,
  };
  const series = tcoSeries(tco);
  const be = breakEvenYear(tco);
  const needsPrice = params.a.priceYen <= 0 || params.b.priceYen <= 0;

  const yenDiff = rb.dayYen - ra.dayYen;
  const co2Diff = rb.dayCo2Kg - ra.dayCo2Kg;
  const maxYen = Math.max(ra.dayYen, rb.dayYen, 1);
  const maxCo2 = Math.max(ra.dayCo2Kg, rb.dayCo2Kg, 1);

  const diffText = (diff: number, unit: string, digits: number, word: string) => {
    if (Math.abs(diff) < Math.pow(10, -digits) / 2) return "車両Aと車両Bで差はありません";
    const v = formatNumber(Math.abs(diff), digits);
    return diff > 0
      ? `車両A のほうが ▼ ${v} ${unit} ${word}`
      : `車両B のほうが ▼ ${v} ${unit} ${word}`;
  };

  const savedAt = new Date(createdAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  // print-a4 は「A4縦1枚に詰める印刷CSS(globals.css §10)を効かせる」印。
  // 診断書と共有シナリオだけに付ける — 読み物ページに掛かると本文が8pxになる
  return (
    <main className="print-a4 mx-auto w-full max-w-[900px] px-4 py-8">
      <nav className="mb-4 text-note text-ink-3 print:hidden">
        <Link href="/routes" className="text-accent hover:text-accent-strong">路線一覧</Link>
        <span className="mx-1">/</span>
        <Link href={`/routes/${params.routeId}`} className="text-accent hover:text-accent-strong">{routeName}</Link>
        <span className="mx-1">/</span>
        共有シナリオ
      </nav>

      <h1 className="text-page-title">共有シナリオ — {routeName}</h1>
      <p className="mt-1 text-aux text-ink-2">
        {agency} / 片道 {formatKm(lengthKm)} km / {repDayLabel}ダイヤ {repTrips} 便
        / 最急勾配 {formatNumber(gmax * 100, 1)} %
      </p>
      <p className="mt-0.5 text-note text-ink-3">
        保存日時 {savedAt} / シナリオID {id} / 診断データ版 {params.bundleVersion}
      </p>

      <div className="mt-card-gap space-y-card-gap">
        <Section title="この条件での結論" caption={`${repDayLabel}ダイヤ ${repTrips} 便を1台で走らせた場合。`}>
          {needsPrice ? (
            <p className="text-body">
              車両価格が未入力のため、損益分岐年数は算出していません。
            </p>
          ) : be === null ? (
            <p className="text-body">
              この条件では <strong>{params.tcoYears}年以内に累計コストは逆転しません</strong>。
            </p>
          ) : (
            <>
              <p className="text-aux text-ink-2">損益分岐年数</p>
              <p className="text-hero leading-none">
                {formatNumber(be, 1)}
                <span className="ml-1 text-body font-normal text-ink-2">年</span>
              </p>
            </>
          )}
          <p className="mt-3 text-body">
            <strong className="tabular-nums">{diffText(yenDiff, "円/日", 0, "安い")}</strong>
            {Math.abs(yenDiff) >= 0.5 && (
              <span className="text-ink-2">(年間 {formatInt(Math.abs(yenDiff) * params.annualDays)}円)</span>
            )}
          </p>
          <p className="text-body">
            <strong className="tabular-nums">{diffText(co2Diff, "kg-CO2/日", 1, "少ない")}</strong>
          </p>
        </Section>

        <Section title="車両ごとの結果" caption="保存された条件をそのまま再計算しています。">
          {/* 印刷CSSの .grid は5列に固定されるので flex で組む(globals.css §10) */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <VehiclePanel side="A" input={params.a} result={ra} repDayLabel={repDayLabel} />
            <VehiclePanel side="B" input={params.b} result={rb} repDayLabel={repDayLabel} />
          </div>

          <p className="mt-4 text-aux font-semibold text-ink-2">燃料・電力費(円/日)</p>
          <div className="mt-2 space-y-2">
            <Bar label="車両A" value={ra.dayYen} max={maxYen} display={`${formatInt(ra.dayYen)}円`} />
            <Bar label="車両B" value={rb.dayYen} max={maxYen} display={`${formatInt(rb.dayYen)}円`} variant="diesel" />
          </div>
          <p className="mt-3 text-aux font-semibold text-ink-2">CO2排出(kg/日)</p>
          <div className="mt-2 space-y-2">
            <Bar label="車両A" value={ra.dayCo2Kg} max={maxCo2} display={`${formatNumber(ra.dayCo2Kg, 1)} kg`} />
            <Bar label="車両B" value={rb.dayCo2Kg} max={maxCo2} display={`${formatNumber(rb.dayCo2Kg, 1)} kg`} variant="diesel" />
          </div>
        </Section>

        <Section
          title="TCO(総保有コスト)"
          caption="車両価格 − 補助金 + エネルギー費の累計。整備費・充電器設置費・人件費は含みません。"
        >
          <TcoChart
            series={series}
            years={params.tcoYears}
            breakEven={be}
            nameA={params.a.vehicle.name}
            nameB={params.b.vehicle.name}
          />
        </Section>

        <Section title="試算の仮定" caption="この画面の数値はすべて次の値から計算しています。">
          {/* 印刷はA4縦1枚に収めるため、同じ値を1段落に畳んで出す(DESIGN §10) */}
          <p className="hidden text-note print:block">
            空調 {formatNumber(params.auxW / 1000, 1)}kW / 単価 電力{params.yenPerKwh}円/kWh・軽油
            {params.yenPerLiterDiesel}円/L / 表定速度 {cruiseSpeedKmh(lengthM)}km/h / 電池の使用可能割合
            {Math.round(DEFAULT_EV.usableRatio * 100)}% / 年間走行距離 {formatKm(lengthKm)}km ×{repTrips}便
            ×{params.annualDays}日 = {formatInt(annualKm)}km / TCO評価期間 {params.tcoYears}年 /
            TCOに含めない費目 整備費・充電器設置費・人件費・税保険 / 勾配プロファイル 25m間隔・補正後 /
            CO2 軽油{CO2.dieselKgPerL}kg/L・電力{CO2.gridKgPerKwh}kg/kWh
          </p>
          <dl className="print:hidden">
            <DefinitionRow label="空調負荷" value={`${formatNumber(params.auxW / 1000, 1)} kW`} />
            <DefinitionRow
              label="単価"
              value={`電力 ${params.yenPerKwh} 円/kWh / 軽油 ${params.yenPerLiterDiesel} 円/L`}
            />
            <DefinitionRow label="表定速度" value={`${cruiseSpeedKmh(lengthM)} km/h`} />
            <DefinitionRow
              label="電池の使用可能割合"
              value={`${Math.round(DEFAULT_EV.usableRatio * 100)} %(全車共通)`}
            />
            <DefinitionRow
              label="年間走行距離"
              value={`${formatKm(lengthKm)} km × ${repTrips} 便 × ${params.annualDays} 日 = ${formatInt(annualKm)} km`}
            />
            <DefinitionRow label="TCOの評価期間" value={`${params.tcoYears} 年`} />
            <DefinitionRow label="TCOに含めない費目" value="整備費・充電器設置費・人件費・税保険" />
            <DefinitionRow label="勾配プロファイル" value="25m間隔・補正後(診断書と同一)" />
            <DefinitionRow
              label="CO2排出係数"
              value={`軽油 ${CO2.dieselKgPerL} kg/L / 電力 ${CO2.gridKgPerKwh} kg/kWh`}
            />
          </dl>

          <p className="mt-4 text-aux font-semibold text-ink-2">車両スペックの出典</p>
          <dl className="mt-1">
            {[params.a.vehicle, params.b.vehicle].map((v, i) => (
              <div key={`${v.id}-${i}`} className="border-b border-grid py-2 last:border-b-0">
                <dt className="text-aux font-semibold">
                  車両{i === 0 ? "A" : "B"} {v.name}
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
            このページは保存時点の条件・車両スペック・診断データ版({params.bundleVersion})を
            そのまま保持しています。後から車両マスタや診断データが更新されても、ここの数値は変わりません。
          </p>
        </Section>

        <div className="flex flex-wrap items-center gap-4 print:hidden">
          <Link
            href={`/routes/${params.routeId}/compare`}
            className="text-body font-semibold text-accent hover:text-accent-strong"
          >
            この路線の比較画面を開く →
          </Link>
          <Link
            href={`/routes/${params.routeId}`}
            className="text-body font-semibold text-accent hover:text-accent-strong"
          >
            診断書を見る →
          </Link>
        </div>
      </div>
    </main>
  );
}
