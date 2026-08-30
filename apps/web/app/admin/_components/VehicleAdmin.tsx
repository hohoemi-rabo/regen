"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Vehicle } from "@regen/core";
import { Button } from "@/app/_components/Button";
import { DataTable, type Column } from "@/app/_components/DataTable";
import { NumberField } from "@/app/_components/NumberField";
import { SelectField, TextArea, TextField } from "@/app/_components/TextField";
import { formatInt, formatNumber } from "@/lib/format";
import { Section } from "@/app/routes/[id]/_components/sections";

export type AdminVehicle = Vehicle & { isPublic: boolean };

const BLANK: AdminVehicle = {
  id: "", name: "", powertrain: "ev", massKg: 8500, batteryKwh: 105,
  driveEff: 0.85, regenEff: 0.62, cda: 5, crr: 0.008, fuelKmPerL: null,
  priceYen: null, subsidyYen: null, sourceUrl: null, note: "", isPublic: true,
};

/**
 * 車両マスタの編集(F-7-2)。
 * **物理削除はしない。** 公開から外すのは `isPublic` の切替で、行は残す
 * (過去の試算がどんな値を前提にしていたか後から辿れるようにするため)。
 */
export function VehicleAdmin({ vehicles }: { vehicles: AdminVehicle[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminVehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(v: AdminVehicle) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? `保存できませんでした(HTTP ${res.status})`);
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<AdminVehicle>[] = [
    { key: "name", header: "車種", render: (v) => (
      <button type="button" onClick={() => { setEditing(v); setError(null); }}
        className="font-semibold text-accent hover:text-accent-strong">{v.name}</button>
    ) },
    { key: "powertrain", header: "動力", render: (v) => (v.powertrain === "ev" ? "EV" : "ディーゼル") },
    { key: "mass", header: "重量 kg", align: "right", render: (v) => formatInt(v.massKg) },
    { key: "batt", header: "電池 kWh", align: "right", render: (v) => v.batteryKwh === null ? "—" : formatNumber(v.batteryKwh, 1) },
    { key: "fuel", header: "燃費 km/L", align: "right", render: (v) => v.fuelKmPerL === null ? "—" : formatNumber(v.fuelKmPerL, 1) },
    { key: "price", header: "価格 円", align: "right", render: (v) => v.priceYen === null ? "—" : formatInt(v.priceYen) },
    { key: "public", header: "公開", render: (v) => (v.isPublic ? "公開中" : "非公開"),
      cellClass: (v) => (v.isPublic ? "" : "text-ink-3") },
  ];

  return (
    <>
      <Section title="車両マスタ" caption="比較画面(F-3)の選択肢になります。非公開にすると選べなくなります。">
        <DataTable columns={columns} rows={vehicles} rowKey={(v) => v.id} minWidth={720} />
        <div className="mt-4">
          <Button onClick={() => { setEditing({ ...BLANK }); setError(null); }}>車両を追加</Button>
        </div>
      </Section>

      {editing && (
        <Section
          title={vehicles.some((v) => v.id === editing.id) ? `編集: ${editing.name || editing.id}` : "新しい車両"}
          caption="CdA・転がり抵抗・効率はメーカー非公表のため、既定値を使ったなら注記にそう書いてください。"
        >
          <VehicleForm value={editing} onChange={setEditing} />

          {error && (
            <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-verdict-cond-text">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => save(editing)} disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              やめる
            </Button>
            {vehicles.some((v) => v.id === editing.id) && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => save({ ...editing, isPublic: !editing.isPublic })}
              >
                {editing.isPublic ? "公開を止める" : "公開に戻す"}
              </Button>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

function VehicleForm({
  value,
  onChange,
}: {
  value: AdminVehicle;
  onChange: (v: AdminVehicle) => void;
}) {
  const set = <K extends keyof AdminVehicle>(k: K, v: AdminVehicle[K]) => onChange({ ...value, [k]: v });
  const isEv = value.powertrain === "ev";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="ID" value={value.id} hint="英小文字・数字・ハイフン。保存後は変えない"
        onChange={(v) => set("id", v)} />
      <TextField label="車種名" value={value.name} onChange={(v) => set("name", v)} />
      <SelectField label="動力" value={value.powertrain}
        options={[{ value: "ev", label: "EV" }, { value: "diesel", label: "ディーゼル" }]}
        onChange={(v) => set("powertrain", v as "ev" | "diesel")} />
      <NumberField label="車両総重量" value={value.massKg} unit="kg" min={1000} max={40000} step={100}
        onChange={(v) => set("massKg", v ?? 8500)} />
      <NumberField label="電池容量" value={value.batteryKwh} unit="kWh" nullable min={1} max={1000} step={0.1}
        hint={isEv ? "EVは必須" : "ディーゼルは空欄"} onChange={(v) => set("batteryKwh", v)} />
      <NumberField label="燃費" value={value.fuelKmPerL} unit="km/L" nullable min={0.1} max={100} step={0.1}
        hint={isEv ? "EVは空欄" : "ディーゼルは必須"} onChange={(v) => set("fuelKmPerL", v)} />
      <NumberField label="駆動効率" value={value.driveEff} unit="" nullable min={0.1} max={1} step={0.01}
        onChange={(v) => set("driveEff", v)} />
      <NumberField label="回生効率" value={value.regenEff} unit="" nullable min={0.1} max={1} step={0.01}
        onChange={(v) => set("regenEff", v)} />
      <NumberField label="CdA" value={value.cda} unit="m²" min={0.5} max={20} step={0.1}
        onChange={(v) => set("cda", v ?? 5)} />
      <NumberField label="転がり抵抗係数" value={value.crr} unit="" min={0.001} max={0.05} step={0.001}
        onChange={(v) => set("crr", v ?? 0.008)} />
      <NumberField label="車両価格(税別)" value={value.priceYen} unit="円" nullable min={0} step={100000}
        onChange={(v) => set("priceYen", v)} />
      <NumberField label="補助金" value={value.subsidyYen} unit="円" nullable min={0} step={100000}
        onChange={(v) => set("subsidyYen", v)} />
      <div className="sm:col-span-2">
        <TextField label="出典URL" value={value.sourceUrl ?? ""} type="url"
          onChange={(v) => set("sourceUrl", v === "" ? null : v)} />
      </div>
      <div className="sm:col-span-2">
        <TextArea label="注記(試算の仮定に出ます)" value={value.note} rows={4}
          hint="公表値でない項目をどう埋めたかを書く。推測は推測と分かる文言にする"
          onChange={(v) => set("note", v)} />
      </div>
    </div>
  );
}
