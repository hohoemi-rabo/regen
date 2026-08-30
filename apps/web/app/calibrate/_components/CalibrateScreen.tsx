"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  PRICE,
  SUMMER_AUX_W,
  WINTER_AUX_W,
  cruiseSpeedKmh,
  fitCalibration,
  fitDieselKmPerL,
  type Calibration,
} from "@regen/core";
import { Button } from "@/app/_components/Button";
import { StatTile, StatTileGrid } from "@/app/_components/StatTile";
import { DataTable, type Column } from "@/app/_components/DataTable";
import { formatKm, formatNumber } from "@/lib/format";
import { DefinitionRow, Section } from "@/app/routes/[id]/_components/sections";
import { useCalibration } from "@/app/_components/calibration/CalibrationProvider";
import { CsvError, guessColumns, readCsvFile, type ParsedCsv } from "../lib/csv";
import { prepareRows, type ColumnMap, type PreparedRow, type RouteBasis, type Unit } from "../lib/prepare";
import { ColumnMapper } from "./ColumnMapper";
import { DropZone } from "./DropZone";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "loaded"; fileName: string; csv: ParsedCsv }
  | { kind: "error"; message: string };

const UNIT_LABEL: Record<Unit, string> = { kwh: "電力量(kWh)", liters: "軽油(L)" };

export function CalibrateScreen({ routes }: { routes: RouteBasis[] }) {
  const { calibration, save, clear } = useCalibration();
  const unitId = useId();
  const routeId = useId();

  const [state, setState] = useState<State>({ kind: "idle" });
  const [cols, setCols] = useState<ColumnMap>({ date: -1, distance: -1, consumption: -1, duration: -1 });
  const [unit, setUnit] = useState<Unit>("kwh");
  const [basisId, setBasisId] = useState(routes[0]?.id ?? "");

  const basis = routes.find((r) => r.id === basisId) ?? routes[0];

  async function onFile(file: File) {
    setState({ kind: "parsing", fileName: file.name });
    try {
      // 読み取りはこのブラウザの中だけ。fetch も Server Action も通らない
      const csv = await readCsvFile(file);
      setCols(guessColumns(csv.header));
      setState({ kind: "loaded", fileName: file.name, csv });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof CsvError ? e.message : "CSVを読み取れませんでした",
      });
    }
  }

  const csv = state.kind === "loaded" ? state.csv : null;
  const ready = csv !== null && cols.date >= 0 && cols.distance >= 0 && cols.consumption >= 0 && basis;

  /** 突き合わせと当てはめ。CompareScreen と同じく同期の useMemo で回す */
  const result = useMemo(() => {
    if (!csv || !ready || !basis) return null;
    const prepared = prepareRows(csv.rows, cols, basis, unit);
    if (prepared.rows.length === 0) return { prepared, fit: null as null | FitView };

    if (unit === "liters") {
      const d = fitDieselKmPerL(
        prepared.rows.map((r) => ({ km: r.km, liters: r.observed })),
        PRICE.dieselKmPerL
      );
      return {
        prepared,
        fit: {
          kind: "diesel" as const,
          mapeBefore: d.mapeBefore,
          mapeAfter: d.mapeAfter,
          clamped: d.clamped,
          rows: d.rows,
          calibration: { v: 1, kDrive: 1, kAux: 1, kmPerL: d.kmPerL } satisfies Calibration,
          predict: (r: PreparedRow) => r.km / d.kmPerL,
          basePredict: (r: PreparedRow) => r.km / PRICE.dieselKmPerL,
        },
      };
    }

    const f = fitCalibration(
      prepared.rows.map((r) => ({ mechKwh: r.mechKwh, auxKwh: r.auxKwh, observedKwh: r.observed }))
    );
    return {
      prepared,
      fit: {
        kind: "ev" as const,
        mapeBefore: f.mapeBefore,
        mapeAfter: f.mapeAfter,
        clamped: f.clamped,
        separable: f.separable,
        rows: f.rows,
        calibration: { v: 1, kDrive: f.kDrive, kAux: f.kAux, kmPerL: null } satisfies Calibration,
        predict: (r: PreparedRow) => f.kDrive * r.mechKwh + f.kAux * r.auxKwh,
        basePredict: (r: PreparedRow) => r.predicted,
      },
    };
  }, [csv, cols, basis, unit, ready]);

  const fit = result?.fit ?? null;
  const unitSuffix = unit === "kwh" ? "kWh" : "L";

  const columns: Column<PreparedRow>[] = [
    { key: "line", header: "行", align: "right", render: (r) => r.line },
    { key: "month", header: "月", align: "right", render: (r) => r.month },
    { key: "km", header: "距離 km", align: "right", render: (r) => formatKm(r.km) },
    { key: "obs", header: `実測 ${unitSuffix}`, align: "right", render: (r) => formatNumber(r.observed, 1) },
    {
      key: "before",
      header: `補正前 ${unitSuffix}`,
      align: "right",
      render: (r) => (fit ? formatNumber(fit.basePredict(r), 1) : "—"),
    },
    {
      key: "after",
      header: `補正後 ${unitSuffix}`,
      align: "right",
      render: (r) => (fit ? formatNumber(fit.predict(r), 1) : "—"),
      cellClass: () => "font-semibold",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <nav className="mb-4 text-note text-ink-3">
        <Link href="/routes" className="text-accent hover:text-accent-strong">
          路線一覧
        </Link>
        <span className="mx-1">/</span>
        じぶん補正
      </nav>

      <h1 className="text-page-title">じぶん補正 — 実測データで精度を上げる</h1>
      <p className="mt-1 text-aux text-ink-2">
        この診断はオープンデータだけで作った一次診断です。手元の運行実績を読み込むと、
        推定モデルの係数をあなたの実力値に合わせ直します。
      </p>

      <div className="mt-card-gap space-y-card-gap">
        <Section title="1. 運行実績のCSVを読み込む">
          <DropZone
            onFile={onFile}
            fileName={state.kind === "loaded" ? state.fileName : undefined}
            disabled={state.kind === "parsing"}
          />
          {state.kind === "error" && (
            <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-verdict-cond-text">
              <strong>読み込めませんでした。</strong> {state.message}
            </p>
          )}
          {csv && (
            <p className="mt-3 text-note text-ink-3">
              {csv.rows.length} 行 / {csv.header.length} 列(文字コード: {csv.encoding}
              {csv.encoding === "shift_jis" && " として読み直しました"})
            </p>
          )}
        </Section>

        {csv && (
          <Section title="2. 列と単位を合わせる" caption="見出しから推定しています。違っていれば選び直してください。">
            <ColumnMapper header={csv.header} value={cols} onChange={setCols} />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={unitId} className="text-aux text-ink-2">
                  消費量の単位
                </label>
                <select
                  id={unitId}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="mt-1 h-11 w-full rounded-btn border border-line bg-accent-weak px-3 text-body sm:h-10"
                >
                  {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-note text-ink-3">
                  {unit === "kwh"
                    ? "車両効率と空調負荷の係数を補正します"
                    : "実燃費(km/L)を補正します。軽油の消費から車両効率は出しません"}
                </p>
              </div>

              <div>
                <label htmlFor={routeId} className="text-aux text-ink-2">
                  突き合わせる路線
                </label>
                <select
                  id={routeId}
                  value={basisId}
                  onChange={(e) => setBasisId(e.target.value)}
                  className="mt-1 h-11 w-full rounded-btn border border-line bg-accent-weak px-3 text-body sm:h-10"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}({r.agency})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-note text-ink-3">
                  この路線の地形を前提に実測と突き合わせます
                </p>
              </div>
            </div>
          </Section>
        )}

        {result && fit && (
          <Section
            title="3. 補正前後の誤差"
            caption="実測に対する推定のずれ(平均絶対誤差率)。小さいほど実態に近いことを意味します。"
          >
            <StatTileGrid>
              <StatTile
                label="補正前の誤差"
                value={formatNumber(fit.mapeBefore, 1)}
                unit="%"
                hint="既定の推定モデル"
              />
              <StatTile
                label="補正後の誤差"
                value={formatNumber(fit.mapeAfter, 1)}
                unit="%"
                hint={fit.mapeAfter <= fit.mapeBefore ? "実測に近づきました" : "改善しませんでした"}
              />
              {fit.kind === "ev" ? (
                <>
                  <StatTile
                    label="車両効率の係数"
                    value={formatNumber(fit.calibration.kDrive, 2)}
                    hint="走行に要るエネルギーの倍率"
                  />
                  <StatTile
                    label="空調負荷の係数"
                    value={fit.separable ? formatNumber(fit.calibration.kAux, 2) : "—"}
                    hint={fit.separable ? "空調に要るエネルギーの倍率" : "このデータでは分離できません"}
                  />
                </>
              ) : (
                <StatTile
                  label="実燃費"
                  value={formatNumber(fit.calibration.kmPerL ?? 0, 2)}
                  unit="km/L"
                  hint={`既定は ${PRICE.dieselKmPerL} km/L`}
                />
              )}
              <StatTile label="使った行数" value={String(fit.rows)} unit="行" />
            </StatTileGrid>

            {fit.kind === "ev" && !fit.separable && (
              <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-ink-2">
                <strong>空調の分離ができないデータです。</strong>
                走行と空調はどちらも走った分だけ増えるため、同じ季節・似た運行のデータだけでは
                2つを数学的に切り分けられません。ここでは空調を既定のまま置き、
                <strong>総合効率の1係数として補正</strong>しました。
                夏と冬の両方を含むデータ、または運行時間の列があると分離できます。
              </p>
            )}
            {fit.clamped && (
              <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-verdict-cond-text">
                <strong>実測と推定の開きが大きすぎます。</strong>
                係数を安全な範囲で頭打ちにしました。列の対応づけ・単位・突き合わせる路線が
                合っているか確かめてください。
              </p>
            )}
            {result.prepared.skipped.length > 0 && (
              <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-ink-2">
                <strong>{result.prepared.skipped.length} 行を読み飛ばしました。</strong>{" "}
                {result.prepared.skipped
                  .slice(0, 3)
                  .map((s) => `${s.line}行目: ${s.reason}`)
                  .join(" / ")}
                {result.prepared.skipped.length > 3 && " ほか"}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => save(fit.calibration)}>この補正を適用する</Button>
              <span className="text-note text-ink-3">
                係数はこの端末にだけ保存され、以後の診断書・比較・一覧・マップに反映されます。
              </span>
            </div>
          </Section>
        )}

        {result && result.prepared.rows.length > 0 && (
          <Section title="行ごとの突き合わせ" caption="実測と推定を並べたものです。">
            <DataTable columns={columns} rows={result.prepared.rows} rowKey={(r) => String(r.line)} minWidth={560} />
          </Section>
        )}

        {calibration && (
          <Section title="いま適用中の補正" caption="解除すると、すべての画面が既定の推定値に戻ります。">
            <dl>
              <DefinitionRow label="車両効率の係数" value={`×${formatNumber(calibration.kDrive, 2)}`} />
              <DefinitionRow label="空調負荷の係数" value={`×${formatNumber(calibration.kAux, 2)}`} />
              <DefinitionRow
                label="実燃費"
                value={
                  calibration.kmPerL === null
                    ? `既定 ${PRICE.dieselKmPerL} km/L`
                    : `${formatNumber(calibration.kmPerL, 2)} km/L`
                }
              />
            </dl>
            <div className="mt-4">
              <Button variant="secondary" onClick={clear}>
                補正を破棄して既定値に戻す
              </Button>
            </div>
          </Section>
        )}

        <Section title="この補正のしくみと限界" caption="数値の根拠を隠さないための説明です。">
          <dl>
            <DefinitionRow
              label="補正のかけ方"
              value="補正後kWh = 車両効率係数×(力行−回生) + 空調係数×空調"
            />
            <DefinitionRow label="季節の判定" value="12〜3月を冬、それ以外を夏として扱う" />
            <DefinitionRow
              label="空調負荷の既定値"
              value={`夏 ${SUMMER_AUX_W / 1000} kW / 冬 ${WINTER_AUX_W / 1000} kW`}
            />
            <DefinitionRow
              label="運行時間"
              value={
                result?.prepared.usedDuration
                  ? "CSVの運行時間の列を使用"
                  : `表定速度から算出(${basis ? cruiseSpeedKmh(basis.lengthM) : 32} km/h)`
              }
            />
            <DefinitionRow label="係数の許容範囲" value="0.30〜3.00(外れる場合は頭打ち)" />
            <DefinitionRow label="保存先" value="この端末のブラウザのみ(サーバーに送りません)" />
          </dl>
          <p className="mt-4 text-note text-ink-3">
            CSVの各行がどの地形を走ったかは分からないため、選んだ路線の勾配を前提に突き合わせています。
            実際の運行と地形が違う場合、その差も係数に吸収されます。軽油の実測から車両効率を出すには
            エンジンの熱効率を仮定する必要があり、その仮定が係数に化けてしまうため踏み込んでいません。
          </p>
        </Section>
      </div>
    </main>
  );
}

/** 当てはめ結果の表示用。EVと軽油で中身が違うので判別可能ユニオンにする */
type FitView =
  | {
      kind: "ev";
      mapeBefore: number;
      mapeAfter: number;
      clamped: boolean;
      separable: boolean;
      rows: number;
      calibration: Calibration;
      predict: (r: PreparedRow) => number;
      basePredict: (r: PreparedRow) => number;
    }
  | {
      kind: "diesel";
      mapeBefore: number;
      mapeAfter: number;
      clamped: boolean;
      rows: number;
      calibration: Calibration;
      predict: (r: PreparedRow) => number;
      basePredict: (r: PreparedRow) => number;
    };
