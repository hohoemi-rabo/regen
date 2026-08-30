import { listVehicles } from "@/lib/data";

export const revalidate = 3600;

/** GET /api/vehicles — 公開車両マスタ(要件§7)。非公開行は返さない */
export async function GET() {
  const vehicles = await listVehicles();
  return Response.json({ count: vehicles.length, vehicles });
}
