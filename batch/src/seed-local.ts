/**
 * ビルド用のローカルD1/R2をコミット済み `data/bundle/` から作り直す。
 *
 * **なぜ要るか。** `next build` は46路線×2ページを事前生成し、その `generateStaticParams` が
 * D1を引く(`apps/web/lib/data.ts` の `listRouteIds`)。`.wrangler/` はgitignoreなので、
 * クリーンチェックアウト——つまりCI——ではテーブルすら無く、ビルドが落ちる。
 *
 * **なぜバッチを流さないか。** `pnpm batch -- --skip-fetch` でも同じ状態は作れるが、
 *   1. 標高タイルを国土地理院へ取りに行くので、デプロイのたびに外部サイトの生死に依存する
 *   2. しきい値を**対象のD1**から読む(publish.ts の loadThresholds)。CIの空のD1では
 *      既定値になるため、管理画面(F-7-4)で本番のしきい値を変えていると、
 *      本番と違う判定を計算してそれを焼き込んだページを配信してしまう
 *
 * ここは診断を一切回さず、**本番が公開した値そのもの**(版・しきい値を含む)を書き戻す。
 * 完全オフラインで、外部サイトにもgtfs-data.jpにも触らない。
 *
 * 使い方: `pnpm seed:local`(ルートから)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publish } from "./publish";
import { computeVersion, type RemoteFeed } from "./feeds";
import type { Bundle, D1Seed } from "./pipeline";
import type { CfTarget } from "./cf";
import { d1Migrate } from "./cf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "data", "bundle");

function read<T>(name: string): T {
  const p = join(DIR, name);
  if (!existsSync(p)) {
    throw new Error(
      `${p} がありません。先に一度 \`pnpm batch\` を流して data/bundle/ を作ってください`
    );
  }
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function loadBundle(): { bundle: Bundle; seed: D1Seed } {
  const seed = read<D1Seed>("d1.json");
  if (!seed.version || typeof seed.createdAt !== "number") {
    throw new Error("data/bundle/d1.json に版か生成時刻がありません。`pnpm batch` を流し直してください");
  }

  const bundle: Bundle = {
    summary: read("routes_summary.json"),
    geojson: read("map.geojson"),
    profiles: read("profiles.json"),
    profiles25: read("profiles25.json"),
    schedules: read("schedules.json"),
    agencies: read("agencies.json"),
    feeds: read("feeds.json"),
    lengthM: seed.lengthM,
    maxGrade: seed.maxGrade,
    feedOf: seed.feedOf,
  };

  // 8ファイルが同じ回の産物であることの最低限の確認。
  // 手でどれか1つだけ差し替えると、D1に入る距離や判定が路線と食い違う
  for (const r of bundle.summary) {
    if (bundle.lengthM[r.id] === undefined || bundle.maxGrade[r.id] === undefined || !bundle.feedOf[r.id]) {
      throw new Error(
        `d1.json が routes_summary.json と揃っていません(${r.id} が欠けています)。` +
        "`pnpm batch -- --skip-fetch --no-publish` で作り直してください"
      );
    }
  }
  // 版は入力(フィードのuid + 診断パラメータ)から決まる。d1.json の版がいまのコードで
  // 再現できないなら、成果物が古いか診断パラメータが変わっている。
  // 黙ってシードすると、本番と違う版のキーでページを焼いてしまう
  const remote: RemoteFeed[] = bundle.feeds.map((f) => ({
    id: f.id, organizationId: "", feedId: f.id,
    fileUid: f.fileUid ?? "", publishedAt: f.publishedAt ?? "", fromDate: f.feedStart, fileUrl: "",
  }));
  const expected = computeVersion(remote, seed.thresholds);
  if (expected !== seed.version) {
    throw new Error(
      `d1.json の版 ${seed.version} が、いまのコードで再現される版 ${expected} と一致しません。` +
      "診断パラメータを変えたなら `pnpm batch -- --remote` で公開し直してください"
    );
  }

  return { bundle, seed };
}

async function main() {
  console.log("==> ローカルD1/R2をコミット済み data/bundle/ からシードします(オフライン)");
  const { bundle, seed } = loadBundle();
  console.log(`  版 ${seed.version} / 路線 ${bundle.summary.length} / フィード ${bundle.feeds.length}`);

  // スキーマが無ければ publish の INSERT が落ちる。毎回当てても冪等
  console.log("==> ローカルD1へマイグレーション適用");
  d1Migrate({ root: ROOT, remote: false });

  const t: CfTarget = { root: ROOT, remote: false };
  const res = await publish(t, bundle, seed.version, seed.createdAt, seed.thresholds);
  console.log(`==> シード完了: 版 ${res.version} / R2 ${res.objects} オブジェクト / D1 ${res.statements} 文`);
}

main().catch((e) => {
  console.error(`シードに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
