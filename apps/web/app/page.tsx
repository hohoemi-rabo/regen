import summary from "@/data/routes_summary.json";

type Row = (typeof summary)[number];

const verdictStyle: Record<string, string> = {
  適: "text-verdict-ok",
  条件付き: "text-verdict-cond",
  要検討: "text-verdict-ng",
};

export default function Home() {
  const rows = [...summary].sort((a, b) => b.daily - a.daily);
  const counts = rows.reduce<Record<string, number>>((m, r) => {
    m[r.verdict] = (m[r.verdict] ?? 0) + 1;
    return m;
  }, {});
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Regen ― 下り坂は、燃料になる。</h1>
      <p className="mt-1 text-sm text-stone-600">
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

      <h2 className="mt-10 text-lg font-semibold">1日必要電力量の多い路線</h2>
      <p className="text-xs text-stone-500">F-1マップ実装までの仮表示。データは実診断値。</p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
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
            {rows.slice(0, 15).map((r: Row) => (
              <tr key={r.name + r.agency + r.daily} className="border-b border-stone-100">
                <td className={"p-2 font-semibold " + (verdictStyle[r.verdict] ?? "")}>{r.verdict}</td>
                <td className="p-2 font-medium">{r.name}</td>
                <td className="p-2 text-stone-600">{r.agency}</td>
                <td className="p-2 text-right tabular-nums">{r.L.toFixed(1)}</td>
                <td className="p-2 text-right tabular-nums">{r.trips}</td>
                <td className="p-2 text-right tabular-nums">{Math.round(r.daily)}</td>
                <td className="p-2 text-right tabular-nums">{r.charges}回</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-xs text-stone-400">
        データ出典: GTFSデータリポジトリ(gtfs-data.jp)南信州11フィード / 国土地理院 標高タイル
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
