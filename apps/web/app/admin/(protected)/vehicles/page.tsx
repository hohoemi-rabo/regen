import type { Metadata } from "next";
import { listAllVehicles } from "@/lib/data";
import { VehicleAdmin } from "../../_components/VehicleAdmin";

export const metadata: Metadata = { title: "車両マスタ | Regen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** F-7-2。非公開行も含めて全件出す */
export default async function VehiclesPage() {
  const rows = await listAllVehicles();
  return (
    <VehicleAdmin
      vehicles={rows.map((v) => ({
        id: v.id,
        name: v.name,
        powertrain: v.powertrain as "ev" | "diesel",
        massKg: v.massKg,
        batteryKwh: v.batteryKwh,
        driveEff: v.driveEff,
        regenEff: v.regenEff,
        cda: v.cda,
        crr: v.crr,
        fuelKmPerL: v.fuelKmPerL,
        priceYen: v.priceYen,
        subsidyYen: v.subsidyYen,
        sourceUrl: v.sourceUrl,
        note: v.note ?? "",
        isPublic: v.isPublic === 1,
      }))}
    />
  );
}
