import type { Metadata } from "next";
import { getThresholds } from "@/lib/data";
import { ThresholdForm } from "../../_components/ThresholdForm";

export const metadata: Metadata = { title: "判定しきい値 | Regen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** F-7-4 */
export default async function SettingsPage() {
  return <ThresholdForm initial={await getThresholds()} />;
}
