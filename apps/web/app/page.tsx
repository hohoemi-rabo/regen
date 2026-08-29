import summary from "@/data/routes_summary.json";
import { DataTable, type Column } from "@/app/_components/DataTable";
import { StatTile, StatTileGrid } from "@/app/_components/StatTile";
import { VerdictChip } from "@/app/_components/VerdictChip";
import { isVerdict } from "@/app/_components/verdict";
import { formatInt, formatKm } from "@/lib/format";

type Row = (typeof summary)[number];

const columns: Column<Row>[] = [
  {
    key: "verdict",
    header: "判定",
    render: (r) => (isVerdict(r.verdict) ? <VerdictChip verdict={r.verdict} /> : r.verdict),
  },
  { key: "name", header: "路線", render: (r) => <span className="font-semibold">{r.name}</span> },
  { key: "agency", header: "事業者", render: (r) => <span className="text-ink-2">{r.agency}</span> },
  { key: "L", header: "km", align: "right", render: (r) => formatKm(r.L) },
  { key: "trips", header: "便/日", align: "right", render: (r) => r.trips },
  { key: "daily", header: "日次kWh", align: "right", render: (r) => formatInt(r.daily) },
  { key: "charges", header: "追加充電", align: "right", render: (r) => `${r.charges}回` },
];

export default function Home() {
  const rows = [...summary].sort((a, b) => b.daily - a.daily);
  const counts = rows.reduce<Record<string, number>>((m, r) => {
    m[r.verdict] = (m[r.verdict] ?? 0) + 1;
    return m;
  }, {});
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <h1 className="text-page-title">Regen ― 下り坂は、燃料になる。</h1>
      <p className="mt-1 text-body text-ink-2">
        南信州 全{rows.length}路線のEV化適地診断(プロトタイプ表示・2026-08-29 診断データ)
      </p>

      <div className="mt-6">
        <StatTileGrid>
          <StatTile label="診断路線" value={String(rows.length)} />
          <StatTile label="● 適" value={String(counts["適"] ?? 0)} />
          <StatTile label="▲ 条件付き" value={String(counts["条件付き"] ?? 0)} />
          <StatTile
            label="全線EV化時の電力"
            value={formatInt(rows.reduce((s, r) => s + r.daily, 0))}
            unit="kWh/日"
          />
        </StatTileGrid>
      </div>

      <h2 className="mt-10 text-section">1日必要電力量の多い路線</h2>
      <p className="text-note text-ink-3">F-1マップ実装までの仮表示。データは実診断値。</p>
      <div className="mt-3">
        <DataTable columns={columns} rows={rows.slice(0, 15)} rowKey={(r) => r.name + r.agency + r.daily} />
      </div>
    </main>
  );
}
