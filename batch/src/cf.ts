/**
 * D1 / R2 への書き込み口(wrangler CLI 経由)。
 *
 * バッチはWorkerの外で動くのでバインディングが無い。`apps/web/wrangler.jsonc` を設定として
 * wrangler を直接起動する。`pnpm --filter web exec` を挟むと1回あたり0.7秒余計にかかり、
 * 50回近く呼ぶバッチでは無視できない。
 */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const DB = "regen-db";
const BUCKET = "regen-bundles";
/**
 * 一時的な通信エラーで実行全体を落とさない。
 * 48オブジェクトを直列に上げるあいだ、1回でも fetch failed が出れば全部やり直しになる
 * (週次のActionsでは特に痛い)。R2/D1への書き込みは冪等なので、そのまま再試行してよい。
 */
const RETRIES = 3;

const isTransient = (e: unknown) =>
  /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|503|502|429/i.test(
    e instanceof Error ? `${e.message}${(e as { stderr?: string }).stderr ?? ""}` : String(e)
  );

async function withRetry<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === RETRIES || !isTransient(e)) break;
      const waitMs = 1000 * 2 ** (attempt - 1);
      console.log(`    再試行 ${attempt}/${RETRIES - 1}: ${label}(${waitMs}ms待機)`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export interface CfTarget {
  root: string;
  /** true なら本番、false ならローカル(.wrangler/state) */
  remote: boolean;
}

function bin(root: string) {
  return join(root, "apps", "web", "node_modules", ".bin", "wrangler");
}

function run(t: CfTarget, args: string[]): string {
  return execFileSync(bin(t.root), [...args, t.remote ? "--remote" : "--local"], {
    cwd: join(t.root, "apps", "web"),
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
}

/** wrangler は --json でもバナーを混ぜてくるので、最初のJSONらしき位置から読む */
function parseJson(out: string): unknown {
  const i = out.search(/[[{]/);
  if (i < 0) throw new Error(`wranglerの出力にJSONがありません: ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(i));
}

/** SELECT を投げて行を返す */
export function d1Query<T = Record<string, unknown>>(t: CfTarget, sql: string): T[] {
  const parsed = parseJson(run(t, ["d1", "execute", DB, "--json", "--command", sql])) as
    | { results?: T[] }[]
    | { results?: T[] };
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

/** 複数文をまとめて適用する(ファイル経由。--command は長さの上限が読めない) */
export async function d1ExecFile(t: CfTarget, sqlPath: string): Promise<void> {
  await withRetry("d1 execute", () => run(t, ["d1", "execute", DB, "--file", sqlPath, "-y"]));
}

/**
 * マイグレーションを適用する(冪等。適用済みのものは飛ばされる)。
 * シード(seed-local.ts)は空のローカルD1に対して走るので、INSERTの前にテーブルを作る。
 */
export function d1Migrate(t: CfTarget): void {
  run(t, ["d1", "migrations", "apply", DB]);
}

async function runAsync(t: CfTarget, args: string[]): Promise<void> {
  await execFileAsync(bin(t.root), [...args, t.remote ? "--remote" : "--local"], {
    cwd: join(t.root, "apps", "web"),
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function r2Put(t: CfTarget, key: string, filePath: string): Promise<void> {
  await withRetry(key, () =>
    runAsync(t, [
      "r2", "object", "put", `${BUCKET}/${key}`,
      "--file", filePath, "--content-type", "application/json",
    ])
  );
}

/** SQLリテラル。値はすべてバッチが組み立てたものだが、名前に ' が混ざるのでエスケープは要る */
export const q = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`;
export const n = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v);
