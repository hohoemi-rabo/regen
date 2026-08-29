"use client";

import { useId } from "react";
import { VEHICLES, type SimResult, type Vehicle } from "@regen/core";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { formatInt, formatKwhPerKm, formatNumber } from "@/lib/format";
import { Slider } from "./Slider";

const DASH = "—";

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-grid py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-aux text-ink-2">{label}</div>
        {hint && <div className="text-note text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0 text-body font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * 車両1台分の列。車種セレクタ + 車両固有のスライダー(電池・重量) + 結果。
 * 空調・単価は画面上部の共通スライダーなのでここには置かない(DESIGN §6.4)。
 */
export function VehicleColumn({
  side,
  vehicle,
  massKg,
  batteryKwh,
  result,
  repDayLabel,
  onVehicleChange,
  onMassChange,
  onBatteryChange,
}: {
  /** A=青(--accent) / B=橙(--chart-series2) */
  side: "A" | "B";
  vehicle: Vehicle;
  massKg: number;
  batteryKwh: number;
  result: SimResult;
  repDayLabel: string;
  onVehicleChange: (id: string) => void;
  onMassChange: (v: number) => void;
  onBatteryChange: (v: number) => void;
}) {
  const selectId = useId();
  const isEv = vehicle.powertrain === "ev";
  const accent = side === "A" ? "bg-accent" : "bg-chart-series2";

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${accent}`} aria-hidden="true" />
        <h2 className="text-section">車両{side}</h2>
      </div>

      <label htmlFor={selectId} className="sr-only">
        車両{side}の車種
      </label>
      <select
        id={selectId}
        value={vehicle.id}
        onChange={(e) => onVehicleChange(e.target.value)}
        className="mt-2 h-11 w-full rounded-btn border border-line bg-accent-weak px-3 text-body sm:h-10"
      >
        {VEHICLES.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      <div className="mt-3 space-y-1">
        {isEv && (
          <Slider
            label="電池容量"
            value={batteryKwh}
            min={50}
            max={300}
            step={5}
            unit="kWh"
            defaultValue={vehicle.batteryKwh ?? undefined}
            onChange={onBatteryChange}
          />
        )}
        <Slider
          label="車両総重量"
          value={massKg}
          min={5000}
          max={16000}
          step={100}
          unit="kg"
          display={formatInt(massKg)}
          defaultValue={vehicle.massKg}
          onChange={onMassChange}
        />
      </div>

      {result.infeasible && (
        <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-ink-2">
          <strong>この条件では1便を走り切れません。</strong>
          片道{formatNumber(result.kwhPerTrip ?? 0, 1)} kWh に対し、使用可能な電力量は
          {formatNumber(batteryKwh * 0.8, 1)} kWh(電池の80%)です。電池容量を増やすか、
          途中充電を前提にした運用が必要です。
        </p>
      )}

      <div className="mt-3">
        <Row
          label="電費(選択中の空調負荷)"
          value={isEv ? `${formatKwhPerKm(result.kwhPerKm!)} kWh/km` : DASH}
        />
        <Row
          label="燃費"
          value={isEv ? DASH : `${formatNumber(vehicle.fuelKmPerL ?? 0, 1)} km/L`}
        />
        <Row
          label="往復バッテリー使用率"
          hint={isEv ? `電池${formatNumber(batteryKwh, 1)}kWhに対する1往復` : undefined}
          value={
            isEv ? (
              <span className="flex items-center gap-2">
                {result.verdict && <VerdictChip verdict={result.verdict} />}
                <span>{formatInt(result.roundtripBattPct!)} %</span>
              </span>
            ) : (
              DASH
            )
          }
        />
        <Row
          label="追加充電"
          hint={isEv ? `${repDayLabel}ダイヤの実時刻表から算出` : undefined}
          value={isEv && !result.infeasible ? `${result.extraCharges} 回/日` : DASH}
        />
        <Row
          label={isEv ? "必要電力量" : "軽油消費量"}
          value={
            isEv
              ? `${formatInt(result.dayKwh!)} kWh/日`
              : `${formatNumber(result.dayLiters!, 1)} L/日`
          }
        />
        <Row label="燃料・電力費" value={`${formatInt(result.dayYen)} 円/日`} />
        <Row label="CO2排出" value={`${formatNumber(result.dayCo2Kg, 1)} kg/日`} />
      </div>
    </section>
  );
}
