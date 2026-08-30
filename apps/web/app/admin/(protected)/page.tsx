import type { Metadata } from "next";
import { FEED_EXPIRY_WARN_DAYS, daysUntil, isDefaultThresholds } from "@regen/core";
import { getCurrentBundle, getThresholds, listBatchRuns, listFeeds } from "@/lib/data";
import { DataTable, type Column } from "@/app/_components/DataTable";
import { StatTile, StatTileGrid } from "@/app/_components/StatTile";
import { formatInt, formatNumber } from "@/lib/format";
import { DefinitionRow, Section } from "@/app/routes/[id]/_components/sections";

export const metadata: Metadata = { title: "管理 | Regen", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** 実行メッセージの1行目だけを、長さを切って出す(パスが長いと折り返しきれない) */
const firstLine = (msg: string | null, max: number) => {
  const line = (msg ?? "").split("\n")[0];
  return line.length > max ? `${line.slice(0, max)}…` : line || "—";
};

const jst = (ms: number | null) =>
  ms === null ? "—" : new Date(ms + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

type Run = Awaited<ReturnType<typeof listBatchRuns>>[number];
type Feed = Awaited<ReturnType<typeof listFeeds>>[number];

/** ダッシュボード(F-7-3 / F-8-5)。困っていることを最初に出す(DESIGN §6.8) */
export default async function AdminDashboard() {
  const [runs, feeds, bundle, thresholds] = await Promise.all([
    listBatchRuns(20),
    listFeeds(),
    getCurrentBundle(),
    getThresholds(),
  ]);

  const expiring = feeds
    .map((f) => ({ f, days: daysUntil(f.feedEnd) }))
    .filter((x) => x.days !== null && x.days <= FEED_EXPIRY_WARN_DAYS)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const lastSuccess = runs.find((r) => r.status === "success");
  // **最新の実行が失敗しているときだけ警告する。** 過去の失敗をそのまま拾うと、
  // あとで成功しても警告が消えず、解決済みの赤信号が永久に残る。
  // 過去の失敗は下の実行履歴で追える
  const latest = runs[0];
  const needsAttention = latest && latest.status !== "success" ? latest : null;

  const runColumns: Column<Run>[] = [
    { key: "id", header: "#", align: "right", render: (r) => r.id },
    { key: "status", header: "結果", render: (r) => (r.status === "success" ? "成功" : r.status === "failed" ? "失敗" : "実行中"),
      cellClass: (r) => (r.status === "failed" ? "font-semibold text-verdict-cond-text" : "") },
    { key: "started", header: "開始(JST)", render: (r) => jst(r.startedAt) },
    { key: "sec", header: "所要", align: "right",
      render: (r) => (r.finishedAt ? `${formatNumber((r.finishedAt - r.startedAt) / 1000, 1)} 秒` : "—") },
    { key: "routes", header: "路線", align: "right", render: (r) => r.routes ?? "—" },
    { key: "version", header: "版", render: (r) => r.version ?? "—" },
    { key: "message", header: "メモ", render: (r) => firstLine(r.message, 60) },
  ];

  const feedColumns: Column<Feed>[] = [
    { key: "id", header: "フィード", render: (f) => f.name },
    { key: "end", header: "有効期限", render: (f) => f.feedEnd ?? "—" },
    { key: "days", header: "残り", align: "right",
      render: (f) => { const d = daysUntil(f.feedEnd); return d === null ? "—" : `${formatInt(d)} 日`; },
      cellClass: (f) => { const d = daysUntil(f.feedEnd);
        return d !== null && d <= FEED_EXPIRY_WARN_DAYS ? "font-semibold text-verdict-cond-text" : ""; } },
    { key: "published", header: "公開日", render: (f) => f.publishedAt?.slice(0, 10) ?? "—" },
    { key: "fetched", header: "最終取得(JST)", render: (f) => jst(f.fetchedAt) },
  ];

  return (
    <>
      {(expiring.length > 0 || needsAttention) && (
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-section text-verdict-cond-text">確認が要ること</h2>
          {/* バッチの失敗メッセージには長いパスが入りうる。折り返さないと375pxで溢れる */}
          <ul className="mt-2 space-y-1 break-words text-body">
            {expiring.map(({ f, days }) => (
              <li key={f.id}>
                <strong>{f.name}</strong> のGTFSは <strong>あと {formatInt(days ?? 0)} 日</strong>
                ({f.feedEnd})で期限切れです。差し替わるとバッチは変化ガードで止まります。
              </li>
            ))}
            {needsAttention && (
              <li>
                {needsAttention.status === "running" ? (
                  <>
                    実行中のまま止まっている可能性があります: #{needsAttention.id}(
                    {jst(needsAttention.startedAt)}開始)
                  </>
                ) : (
                  <>
                    <strong>最新のバッチが失敗しています</strong>: #{needsAttention.id}(
                    {jst(needsAttention.startedAt)})— {firstLine(needsAttention.message, 120)}
                  </>
                )}
              </li>
            )}
          </ul>
        </section>
      )}

      <Section title="いまの状態" caption="配信中の診断バンドルと直近のバッチ実行。">
        {/* 数値タイルは数字のためのもの(DESIGN §5.3)。版や日時は26pxだと375pxで溢れる */}
        <StatTileGrid>
          <StatTile label="路線" value={String(bundle?.routeCount ?? "—")} unit="件" />
          <StatTile label="フィード" value={String(bundle?.feedCount ?? "—")} unit="件" />
          <StatTile label="実行記録" value={String(runs.length)} unit="件" hint="直近20件まで" />
        </StatTileGrid>
        <dl className="mt-4">
          <DefinitionRow label="配信中の版" value={bundle?.version ?? "—"} />
          <DefinitionRow label="生成日時(JST)" value={bundle ? jst(bundle.createdAt) : "—"} />
          <DefinitionRow
            label="最終成功(JST)"
            value={lastSuccess ? `${jst(lastSuccess.startedAt)}(${lastSuccess.version ?? "—"})` : "—"}
          />
          <DefinitionRow
            label="判定しきい値"
            value={
              `電池 ${thresholds.fitBattPct}% / ${thresholds.condBattPct}% ・ ` +
              `勾配 ${formatNumber(thresholds.fitMaxGrade * 100, 1)}%` +
              (isDefaultThresholds(thresholds) ? "(初期値)" : "(変更あり)")
            }
          />
        </dl>
      </Section>

      <Section title="フィードの鮮度" caption={`有効期限まで ${FEED_EXPIRY_WARN_DAYS} 日を切ると警告します(F-8-5)。`}>
        <DataTable columns={feedColumns} rows={feeds} rowKey={(f) => f.id} minWidth={640} />
      </Section>

      <Section title="バッチ実行履歴" caption="週次(月曜05:00 JST)と手動実行の記録(F-7-3)。">
        {runs.length === 0 ? (
          <p className="text-body text-ink-2">まだ実行記録がありません。</p>
        ) : (
          <DataTable columns={runColumns} rows={runs} rowKey={(r) => String(r.id)} minWidth={760} />
        )}
      </Section>
    </>
  );
}
