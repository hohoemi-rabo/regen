import { listRoutes, type RouteRecord } from "@/lib/data";
import { Button } from "@/app/_components/Button";
import { ConclusionBadge } from "@/app/_components/ConclusionBadge";
import { DataTable, type Column } from "@/app/_components/DataTable";
import { StatTile, StatTileGrid } from "@/app/_components/StatTile";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { isVerdict, VERDICTS, type Verdict } from "@/app/_components/verdict";
import { formatInt, formatKm, formatKwhPerKm } from "@/lib/format";
import { FilterRowDemo } from "./FilterRowDemo";

/** 共通UIコンポーネントの確認用ページ(チケット01)。リリース前に削除可。 */

type Row = RouteRecord;

const columns: Column<Row>[] = [
  {
    key: "verdict",
    header: "判定",
    render: (r) => (isVerdict(r.verdict) ? <VerdictChip verdict={r.verdict} /> : r.verdict),
  },
  { key: "name", header: "路線", render: (r) => <span className="font-semibold">{r.name}</span> },
  { key: "agency", header: "事業者", render: (r) => <span className="text-ink-2">{r.agency}</span> },
  { key: "L", header: "km", align: "right", render: (r) => formatKm(r.lengthM / 1000) },
  { key: "kwh", header: "電費 kWh/km", align: "right", render: (r) => formatKwhPerKm(r.kwhPerKm) },
  { key: "daily", header: "日次kWh", align: "right", render: (r) => formatInt(r.dailyKwh) },
];

export default async function ComponentsPage() {
  const rows = (await listRoutes()).sort((a, b) => b.dailyKwh - a.dailyKwh).slice(0, 5);
  return (
    <main className="mx-auto w-full max-w-[900px] space-y-card-gap px-4 py-10">
      <h1 className="text-page-title">共通UIコンポーネント確認</h1>

      <Section title="VerdictChip(§5.1)">
        <div className="flex flex-wrap items-center gap-4">
          {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
            <VerdictChip key={v} verdict={v} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
            <VerdictChip key={v} verdict={v} withBackground />
          ))}
        </div>
      </Section>

      <Section title="ConclusionBadge(§5.2)">
        <ConclusionBadge
          verdict="条件付き"
          label="EV化可能 ── 条件付き"
          value="59"
          unit="%"
          caption="冬季1往復でのバッテリー使用率"
          note="1日16便を走らせるには日中5回の充電が必要"
        />
      </Section>

      <Section title="StatTile + StatTileGrid(§5.3)">
        <StatTileGrid>
          <StatTile label="累積上り(片道)" value={formatInt(981)} unit="m" hint="治部坂峠まで登る" />
          <StatTile label="路線長" value={formatKm(36.8)} unit="km" />
          <StatTile label="電費" value={formatKwhPerKm(0.85)} unit="kWh/km" />
          <StatTile label="1日必要電力量" value={formatInt(496.9)} unit="kWh" hint="16便運行時" />
        </StatTileGrid>
      </Section>

      <Section title="Button(§5.6)">
        <div className="flex flex-wrap items-center gap-3">
          <Button>CSVダウンロード</Button>
          <Button variant="secondary">条件を変えて再計算</Button>
          <Button variant="ghost">診断書を見る</Button>
          <Button disabled>保存(無効)</Button>
          <Button variant="secondary" disabled>
            無効
          </Button>
        </div>
      </Section>

      <Section title="DataTable(§5.5)">
        <DataTable columns={columns} rows={rows} rowKey={(r, i) => r.name + i} />
      </Section>

      <Section title="FilterRow(§5.7)">
        <FilterRowDemo />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-section">{title}</h2>
      {children}
    </section>
  );
}
