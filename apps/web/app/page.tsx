import summary from "@/data/routes_summary.json";

type Row = (typeof summary)[number];

// 判定は色 + 記号 + ラベルの3重で伝える(DESIGN §5.1)。文字のアンバーは cond-text
const verdictChip: Record<string, { symbol: string; className: string }> = {
  適: { symbol: "●", className: "text-verdict-ok" },
  条件付き: { symbol: "▲", className: "text-verdict-cond-text" },
  要検討: { symbol: "■", className: "text-verdict-ng" },
};

export default function Home() {
  const rows = [...summary].sort((a, b) => b.daily - a.daily);
  const counts = rows.reduce<Record<string, number>>((m, r) => {
    m[r.verdict] = (m[r.verdict] ?? 0) + 1;
    return m;
  }, {});
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <h1 className="text-page-title font-semibold">Regen ― 下り坂は、燃料になる。</h1>
      <p className="mt-1 text-body text-ink-2">
        南信州 全{rows.length}路線のEV化適地診断(プロトタイプ表示・2026-08-29 診断データ)
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="診断路線" value={String(rows.length)} />
        <Stat label="適" value={String(counts["適"] ?? 0)} />
        <Stat label="条件付き" value={String(counts["条件付き"] ?? 0)} />
        <Stat
          label="全線EV化時の電力"
          value={Math.round(rows.reduce((s, r) => s + r.daily, 0)).toLocaleString() + " kWh/日"}
        />
      </div>

      <h2 className="mt-10 text-section font-semibold">1日必要電力量の多い路線</h2>
      <p className="text-note text-ink-3">F-1マップ実装までの仮表示。データは実診断値。</p>
      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table className="w-full min-w-[640px] text-aux">
          <thead>
            <tr className="border-b border-baseline text-left font-semibold text-ink-2">
              <th className="p-2">判定</th>
              <th className="p-2">路線</th>
              <th className="p-2">事業者</th>
              <th className="p-2 text-right">km</th>
              <th className="p-2 text-right">便/日</th>
              <th className="p-2 text-right">日次kWh</th>
              <th className="p-2 text-right">追加充電</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((r: Row) => {
              const chip = verdictChip[r.verdict];
              return (
                <tr key={r.name + r.agency + r.daily} className="border-b border-grid">
                  <td className={"whitespace-nowrap p-2 font-semibold " + (chip?.className ?? "")}>
                    {chip ? `${chip.symbol} ${r.verdict}` : r.verdict}
                  </td>
                  <td className="p-2 font-semibold">{r.name}</td>
                  <td className="p-2 text-ink-2">{r.agency}</td>
                  <td className="p-2 text-right tabular-nums">{r.L.toFixed(1)}</td>
                  <td className="p-2 text-right tabular-nums">{r.trips}</td>
                  <td className="p-2 text-right tabular-nums">{Math.round(r.daily)}</td>
                  <td className="p-2 text-right tabular-nums">{r.charges}回</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-line bg-surface p-3">
      <div className="text-note text-ink-2">{label}</div>
      <div className="mt-1 text-tile font-semibold tabular-nums">{value}</div>
    </div>
  );
}
