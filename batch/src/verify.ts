/**
 * 変化ガード。
 *
 * 新しく計算した46路線を、直近に公開した `data/bundle/routes_summary.json` と突き合わせる。
 * 差があれば **R2にもD1にも書かずに止める**。承認は `--allow-changes`。
 *
 * 閾値は置かず、丸めた公開値の完全一致で見る。表示する桁で数字が動くなら、それは
 * 利用者から見える変化であり、黙って公開してよいものではない。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SummaryRow } from "./pipeline";

/** 公開値として監視する項目。ここに無い項目は画面に出ていない */
const WATCHED = [
  "name", "agency", "verdict", "batt", "kwh", "L", "up", "gmax",
  "mode", "trips", "regen", "Etr", "emax", "emin", "corr", "daily", "charges", "daily_pct",
] as const;

/** 判定と路線の増減は「重い変化」。数字の丸め1つ分の移動とは分けて見せる */
const MAJOR = new Set(["verdict", "trips", "mode"]);

export interface FieldChange {
  id: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface SummaryDiff {
  added: string[];
  removed: string[];
  changed: FieldChange[];
}

export function loadBaseline(root: string): SummaryRow[] | null {
  const p = join(root, "data", "bundle", "routes_summary.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as SummaryRow[];
}

export function diffSummary(fresh: SummaryRow[], baseline: SummaryRow[]): SummaryDiff {
  const before = new Map(baseline.map((r) => [r.id, r]));
  const after = new Map(fresh.map((r) => [r.id, r]));

  const added = fresh.filter((r) => !before.has(r.id)).map((r) => r.id);
  const removed = baseline.filter((r) => !after.has(r.id)).map((r) => r.id);

  const changed: FieldChange[] = [];
  for (const r of fresh) {
    const o = before.get(r.id);
    if (!o) continue;
    for (const f of WATCHED) {
      if (r[f] !== o[f]) changed.push({ id: r.id, field: f, from: o[f], to: r[f] });
    }
  }
  return { added, removed, changed };
}

export function hasChanges(d: SummaryDiff): boolean {
  return d.added.length > 0 || d.removed.length > 0 || d.changed.length > 0;
}

/** 重い変化(判定・便数・精度の変化、路線の増減)だけ数える */
export function majorCount(d: SummaryDiff): number {
  return d.added.length + d.removed.length + d.changed.filter((c) => MAJOR.has(c.field)).length;
}

/** 人が読む差分。1行目は batch_runs.message にも入れる */
export function formatDiff(d: SummaryDiff, limit = 25): string {
  const lines: string[] = [];
  const routes = new Set(d.changed.map((c) => c.id));
  lines.push(
    `路線 +${d.added.length} / -${d.removed.length} / 変化 ${d.changed.length}項目 (${routes.size}路線)` +
    `、うち重い変化 ${majorCount(d)}`
  );
  for (const id of d.added) lines.push(`  + 新規路線 ${id}`);
  for (const id of d.removed) lines.push(`  - 消えた路線 ${id}`);

  const sorted = [...d.changed].sort(
    (a, b) => Number(MAJOR.has(b.field)) - Number(MAJOR.has(a.field)) || a.id.localeCompare(b.id)
  );
  for (const c of sorted.slice(0, limit)) {
    lines.push(`  ${MAJOR.has(c.field) ? "!" : " "} ${c.id}.${c.field}: ${c.from} → ${c.to}`);
  }
  if (sorted.length > limit) lines.push(`  ... 他 ${sorted.length - limit} 項目`);
  return lines.join("\n");
}
