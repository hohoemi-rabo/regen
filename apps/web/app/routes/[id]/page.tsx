import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  chargingPlan,
  compareDiesel,
  cruiseSpeedKmh,
  CO2,
  DEFAULT_EV,
  PRICE,
  SUMMER_AUX_W,
  WINTER_AUX_W,
} from "@regen/core";
import summary from "@/data/routes_summary.json";
import profiles from "@/data/profiles.json";
import schedules from "@/data/schedules.json";
import { ConclusionBadge } from "@/app/_components/ConclusionBadge";
import { StatTile, StatTileGrid } from "@/app/_components/StatTile";
import { isVerdict } from "@/app/_components/verdict";
import { formatInt, formatKm, formatKwhPerKm, formatNumber } from "@/lib/format";
import { ElevationChart } from "./_components/ElevationChart";
import { Bar, DefinitionRow, Section } from "./_components/sections";

type Row = (typeof summary)[number];
type Profile = (typeof profiles)[keyof typeof profiles];
type Schedule = (typeof schedules)[keyof typeof schedules];

function load(id: string) {
  const row = (summary as Row[]).find((r) => r.id === id);
  const profile = (profiles as Record<string, Profile>)[id];
  const schedule = (schedules as Record<string, Schedule>)[id];
  if (!row || !profile || !schedule) return null;
  return { row, profile, schedule };
}

/** 診断済みの46路線で固定。列挙外のIDは404にする(動的生成させない) */
export const dynamicParams = false;

export function generateStaticParams() {
  return (summary as Row[]).map((r) => ({ id: r.id }));
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const data = load(id);
  if (!data) return { title: "路線が見つかりません | Regen" };
  const { row } = data;
  return {
    title: `${row.name}(${row.agency})— EV化診断 ${row.verdict} | Regen`,
    description: `${row.name}のEV化適性診断。判定は「${row.verdict}」、冬季往復バッテリー使用率${row.batt}%、1日の必要電力量${formatInt(row.daily)}kWh、追加充電${row.charges}回。`,
  };
}

export default async function RoutePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = load(id);
  if (!data) notFound();
  const { row, profile, schedule } = data;

  const lengthKm = profile.lengthM / 1000;
  const kwhWinter = profile.eWinterKwh;
  const plan = chargingPlan(kwhWinter, schedule.trips.map((t) => t.arr), DEFAULT_EV);
  const diesel = compareDiesel(kwhWinter, lengthKm);
  const maxYen = Math.max(diesel.evYen, diesel.dieselYen);
  const maxCo2 = Math.max(diesel.evCo2Kg, diesel.dieselCo2Kg);
  const summerKwhPerKm = profile.eSummerKwh / lengthKm;
  const scheduleDiffers = schedule.repTrips !== schedule.totalTrips;

  const conclusion =
    plan.stops.length === 0
      ? `${schedule.repDayLabel}ダイヤ${schedule.repTrips}便は、朝の満充電だけで走り切れます`
      : `${schedule.repDayLabel}ダイヤ${schedule.repTrips}便を走らせるには、日中${plan.stops.length}回の充電が必要です`;

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <nav className="mb-4 text-note text-ink-3 print:hidden">
        <Link href="/routes" className="text-accent hover:text-accent-strong">
          路線一覧
        </Link>
        <span className="mx-1">/</span>
        {row.name}
      </nav>

      <ConclusionBadge
        verdict={isVerdict(row.verdict) ? row.verdict : "条件付き"}
        label={`${row.name}(${row.agency})`}
        value={String(row.batt)}
        unit="%"
        caption="冬季1往復でのバッテリー使用率"
        note={conclusion}
      />

      <div className="mt-card-gap space-y-card-gap">
        <Section
          title="標高プロファイル"
          caption={`GTFSの路線形状に沿って25m間隔で国土地理院の標高を取得し、175m移動平均で平滑化。グラフ上をなぞると距離・標高・勾配を表示します。`}
        >
          <ElevationChart
            elev={profile.elev}
            stepM={profile.stepM}
            lengthM={profile.lengthM}
            corrSegments={profile.corrSegments}
            firstStop={profile.firstStop}
            lastStop={profile.lastStop}
            peakIdx={profile.peakIdx}
            peakElevM={row.emax}
            routeName={row.name}
          />
        </Section>

        <Section title="路線の数値" caption="片道あたり。電費と電力量は冬(暖房8kW)を基準にしています。">
          <StatTileGrid>
            <StatTile label="路線長(片道)" value={formatKm(lengthKm)} unit="km" />
            <StatTile
              label="累積上り(片道)"
              value={formatInt(row.up)}
              unit="m"
              hint={`最高地点 ${formatInt(row.emax)}m まで登る`}
            />
            <StatTile label="累積下り(片道)" value={formatInt(profile.dn)} unit="m" hint="下りは回生の取りしろ" />
            <StatTile label="最高標高" value={formatInt(row.emax)} unit="m" />
            <StatTile label="最低標高" value={formatInt(row.emin)} unit="m" />
            <StatTile
              label="最急勾配(500m平均)"
              value={formatNumber(row.gmax, 1)}
              unit="%"
              hint={row.gmax >= 10 ? "急勾配。判定を条件付き以上にする要因" : "連続勾配は緩やか"}
            />
            <StatTile label="電費(冬)" value={formatKwhPerKm(row.kwh)} unit="kWh/km" hint="暖房8kWを含む" />
            <StatTile
              label="電費(夏)"
              value={formatKwhPerKm(summerKwhPerKm)}
              unit="kWh/km"
              hint="冷房3kWを含む"
            />
            <StatTile
              label="回生回収量"
              value={formatNumber(row.regen, 1)}
              unit="kWh"
              hint={`力行 ${formatNumber(row.Etr, 1)} kWh の約${Math.round((row.regen / row.Etr) * 100)}%を下り坂で回収`}
            />
            <StatTile
              label="往復バッテリー使用率"
              value={String(row.batt)}
              unit="%"
              hint={`電池${DEFAULT_EV.batteryKwh}kWhに対する冬の1往復`}
            />
          </StatTileGrid>
        </Section>

        <Section
          title="充電計画"
          caption={`${schedule.repDayLabel}ダイヤの実際の時刻表に沿って、朝の満充電から片道ごとに残量を引いて算出しています。`}
        >
          <StatTileGrid>
            <StatTile
              label={`便数(${schedule.repDayLabel})`}
              value={String(schedule.repTrips)}
              unit="便/日"
            />
            <StatTile label="必要電力量" value={formatInt(plan.dayKwh)} unit="kWh/日" hint={`片道 ${formatNumber(kwhWinter, 1)} kWh × ${schedule.repTrips}便`} />
            <StatTile label="追加充電" value={String(plan.stops.length)} unit="回/日" hint={`使用可能 ${formatInt(plan.usableKwh)} kWh(電池の${Math.round(DEFAULT_EV.usableRatio * 100)}%)`} />
          </StatTileGrid>

          {plan.stops.length > 0 ? (
            <div className="mt-4">
              <p className="text-aux font-semibold">充電が必要になる時間帯の目安</p>
              {/* 印刷は1行に畳む(DESIGN §10) */}
              <p className="hidden text-note print:block">
                {plan.stops.map((s) => `${s.afterTrip}便目の後(${s.at}頃)`).join(" / ")}
              </p>
              <dl className="mt-1 print:hidden">
                {plan.stops.map((s) => (
                  <DefinitionRow
                    key={s.afterTrip}
                    label={`${s.afterTrip}便目の運行後(${s.at}頃)`}
                    value={`残 ${formatInt(s.remainingKwh)} kWh`}
                  />
                ))}
              </dl>
              <p className="mt-2 text-note text-ink-3">
                時刻はGTFSの終着時刻です。<strong>1台の車両が{schedule.repDayLabel}の全便を担当する前提</strong>
                で計算しており、複数台で分担する場合は1台あたりの充電回数は減ります。充電に要する時間・充電器の出力は含みません。
              </p>
            </div>
          ) : (
            <p className="mt-3 text-body text-ink-2">
              朝の満充電のみで{schedule.repDayLabel}ダイヤを走り切れます(日中の追加充電は不要)。
            </p>
          )}

          {scheduleDiffers && (
            <div className="mt-4 rounded-tile border border-line bg-page p-3 print:mt-1 print:border-0 print:p-0">
              <p className="text-aux font-semibold print:hidden">一覧の数値との違い</p>
              {/* 印刷は1行に畳む(DESIGN §10) */}
              <p className="hidden text-note text-ink-2 print:block">
                ※ この路線はダイヤが{schedule.breakdown.length}種類あり合計{schedule.totalTrips}便。
                一覧・マップの日次{formatInt(row.daily)}kWh・追加充電{row.charges}回はその合計での上限値で、
                上の充電計画は実際に1日で走る{schedule.repDayLabel}
                {schedule.repTrips}便によるもの。
              </p>
              <p className="mt-1 text-note text-ink-2 print:hidden">
                この路線のGTFSには{schedule.breakdown.length}種類のダイヤがあり(
                {schedule.breakdown.map((b) => `${b.label} ${b.trips}便`).join(" / ")}
                )、合計は{schedule.totalTrips}便です。路線一覧とマップの日次
                {formatInt(row.daily)}kWh・追加充電{row.charges}回は、この
                <strong>全ダイヤ合計{schedule.totalTrips}便</strong>
                で計算した上限値です。実際に1日で走るのは最も便数の多い
                {schedule.repDayLabel}の{schedule.repTrips}便なので、充電計画はそちらで示しています。
              </p>
            </div>
          )}
        </Section>

        <Section
          title="ディーゼル車との比較"
          caption={`同じ片道${formatKm(lengthKm)}kmを、燃費${PRICE.dieselKmPerL}km/Lのディーゼル車で走った場合との比較(片道あたり)。`}
        >
          <p className="text-aux font-semibold text-ink-2">燃料・電力コスト</p>
          <div className="mt-2 space-y-2">
            <Bar label="EV(冬)" value={diesel.evYen} max={maxYen} display={`${formatInt(diesel.evYen)}円`} />
            <Bar
              label="ディーゼル"
              value={diesel.dieselYen}
              max={maxYen}
              display={`${formatInt(diesel.dieselYen)}円`}
              variant="diesel"
            />
          </div>
          <p className="mt-2 text-aux">
            片道あたり <strong className="tabular-nums">{formatInt(diesel.savedYen)}円</strong> 安い(
            {Math.round((diesel.savedYen / diesel.dieselYen) * 100)}%減)
          </p>

          <p className="mt-5 text-aux font-semibold text-ink-2">CO2排出</p>
          <div className="mt-2 space-y-2">
            <Bar
              label="EV(冬)"
              value={diesel.evCo2Kg}
              max={maxCo2}
              display={`${formatNumber(diesel.evCo2Kg, 1)} kg`}
            />
            <Bar
              label="ディーゼル"
              value={diesel.dieselCo2Kg}
              max={maxCo2}
              display={`${formatNumber(diesel.dieselCo2Kg, 1)} kg`}
              variant="diesel"
            />
          </div>
          <p className="mt-2 text-aux">
            片道あたり <strong className="tabular-nums">{formatNumber(diesel.savedCo2Kg, 1)} kg-CO2</strong> 削減(
            {Math.round((diesel.savedCo2Kg / diesel.dieselCo2Kg) * 100)}%減)
          </p>
          <p className="mt-2 text-note text-ink-3">
            EV側も発電に伴うCO2({CO2.gridKgPerKwh} kg-CO2/kWh・全国平均相当)を計上しています。軽油は
            {CO2.dieselKgPerL} kg-CO2/L(温対法 算定・報告・公表制度の標準値)。
          </p>
        </Section>

        <Section title="診断の精度と補正" caption="この診断がどこまで実形状に基づいているかの開示です。">
          <p className="text-body">
            精度ランク <strong>{row.mode}</strong> —{" "}
            {row.mode === "A"
              ? "GTFSのshapes.txtによる実際の路線形状で診断しています。"
              : "この路線にはshapes.txtがないため、停留所を順に結んだ近似形状で診断しています。停留所地点の標高のみを信頼し、区間は線形補間しています(実際の起伏より緩やかに出ます)。"}
          </p>

          {row.mode === "A" && (
            <div className="mt-4">
              {profile.corrSegments.length > 0 ? (
                <>
                  <p className="text-aux">
                    標高タイルはトンネルや高架の上の地表を拾うため、勾配12%を超えて到達する区間を
                    「トンネル・高架」とみなして縦断線を補正しました。補正した区間は合計{" "}
                    <strong className="tabular-nums">{formatInt(row.corr)} m</strong>(全長の
                    {Math.round((row.corr / profile.lengthM) * 100)}%)です。
                  </p>
                  {/* 印刷はA4縦1枚に収めるため、同じ内容を1段落に畳む(DESIGN §10) */}
                  <p className="mt-2 hidden text-note print:block">
                    補正区間:{" "}
                    {profile.corrSegments
                      .map(
                        (s) =>
                          `${formatKm(s.startM / 1000)}〜${formatKm(s.endM / 1000)}km(${formatInt(
                            s.endM - s.startM + 25
                          )}m・最大${formatNumber(s.maxCutM, 1)}m補正)`
                      )
                      .join(" / ")}
                  </p>
                  <div className="mt-3 overflow-x-auto print:hidden">
                    <table className="w-full min-w-[420px] text-aux">
                      <thead>
                        <tr className="border-b border-baseline text-left font-semibold text-ink-2">
                          <th className="p-2">位置(起点から)</th>
                          <th className="p-2 text-right">延長</th>
                          <th className="p-2 text-right">最大の補正量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.corrSegments.map((s) => (
                          <tr key={s.startM} className="border-b border-grid last:border-b-0">
                            <td className="p-2 tabular-nums">
                              {formatKm(s.startM / 1000)} 〜 {formatKm(s.endM / 1000)} km
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {formatInt(s.endM - s.startM + 25)} m
                            </td>
                            <td className="p-2 text-right tabular-nums">{formatNumber(s.maxCutM, 1)} m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-aux text-ink-2">
                  勾配12%を超える不自然な起伏はなく、トンネル・高架としての補正は入っていません。
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-note text-ink-3">
            本診断はオープンデータに基づく一次診断です。実車の走行データ(デジタコ・実電費)を読み込むと、
            電費係数を補正してより実態に近い値を出せます。
          </p>
        </Section>

        <Section title="試算の仮定" caption="この画面の数値はすべて次の値から計算しています。">
          {/* 印刷はA4縦1枚に収めるため、同じ値を1段落に畳んで出す(DESIGN §10) */}
          <p className="hidden text-note print:block">
            車両 {formatInt(DEFAULT_EV.massKg)}kg・CdA {DEFAULT_EV.cda}m²・転がり抵抗{" "}
            {DEFAULT_EV.crr}・駆動 {Math.round(DEFAULT_EV.driveEff * 100)}%・回生{" "}
            {Math.round(DEFAULT_EV.regenEff * 100)}%・電池 {DEFAULT_EV.batteryKwh}kWh(使用可能{" "}
            {Math.round(DEFAULT_EV.usableRatio * 100)}%) / 表定速度 {cruiseSpeedKmh(profile.lengthM)}
            km/h / 空調 夏{SUMMER_AUX_W / 1000}kW・冬{WINTER_AUX_W / 1000}kW / 単価 電力
            {PRICE.yenPerKwh}円/kWh・軽油{PRICE.yenPerLiterDiesel}円/L / ディーゼル比較車{" "}
            {PRICE.dieselKmPerL}km/L / CO2 軽油{CO2.dieselKgPerL}kg/L・電力{CO2.gridKgPerKwh}kg/kWh /
            勾配上限 12%
          </p>
          <dl className="print:hidden">
            <DefinitionRow label="車両総重量" value={`${formatInt(DEFAULT_EV.massKg)} kg`} />
            <DefinitionRow label="前面投影面積 × 空気抵抗係数(CdA)" value={`${DEFAULT_EV.cda} m²`} />
            <DefinitionRow label="転がり抵抗係数" value={String(DEFAULT_EV.crr)} />
            <DefinitionRow label="駆動効率" value={`${Math.round(DEFAULT_EV.driveEff * 100)} %`} />
            <DefinitionRow label="回生効率" value={`${Math.round(DEFAULT_EV.regenEff * 100)} %`} />
            <DefinitionRow
              label="電池容量"
              value={`${DEFAULT_EV.batteryKwh} kWh(使用可能 ${Math.round(DEFAULT_EV.usableRatio * 100)}%)`}
            />
            <DefinitionRow label="表定速度" value={`${cruiseSpeedKmh(profile.lengthM)} km/h`} />
            <DefinitionRow
              label="空調"
              value={`夏 ${SUMMER_AUX_W / 1000} kW / 冬 ${WINTER_AUX_W / 1000} kW`}
            />
            <DefinitionRow
              label="単価"
              value={`電力 ${PRICE.yenPerKwh} 円/kWh / 軽油 ${PRICE.yenPerLiterDiesel} 円/L`}
            />
            <DefinitionRow label="ディーゼル比較車の燃費" value={`${PRICE.dieselKmPerL} km/L(山岳走行)`} />
            <DefinitionRow
              label="CO2排出係数"
              value={`軽油 ${CO2.dieselKgPerL} kg/L / 電力 ${CO2.gridKgPerKwh} kg/kWh`}
            />
            <DefinitionRow label="勾配上限(補正しきい値)" value="12 %" />
          </dl>
        </Section>

        <div className="print:hidden">
          <Link href="/routes" className="text-body font-semibold text-accent hover:text-accent-strong">
            ← 路線一覧に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
