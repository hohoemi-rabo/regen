/**
 * データ更新バッチの入口(F-8)。
 *
 *   pnpm batch                                  ローカルD1/R2へ(取得あり)
 *   pnpm --filter @regen/batch refresh -- --remote            本番へ
 *   pnpm --filter @regen/batch refresh -- --skip-fetch --no-publish   成果物の再生成だけ
 *
 * フラグ
 *   --remote        本番のD1/R2に書く(既定はローカル .wrangler/state)
 *   --allow-changes 公開値の変化を承認して公開する(既定は変化を見つけたら止まる)
 *   --skip-fetch    ネットワークに触らず data/gtfs_zips/ のzipから再生成する
 *   --no-publish    R2/D1に書かない(成果物の再生成と変化ガードだけ)
 *   --force         版が変わっていなくても再計算・再公開する
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchedTileCount } from "./dem";
import {
  computeVersion, downloadFeeds, extractCommittedZips, fetchFeedIndex, loadFeedSources,
  type RemoteFeed,
} from "./feeds";
import { buildBundle, writeArtifacts, type Bundle, type FeedRow } from "./pipeline";
import { currentVersion, finishRun, loadThresholds, publish, startRun, touchFeeds } from "./publish";
import { FEED_EXPIRY_WARN_DAYS, daysUntil, isDefaultThresholds } from "@regen/core";
import { diffSummary, formatDiff, hasChanges, loadBaseline } from "./verify";
import type { CfTarget } from "./cf";

const ROOT = join(process.cwd(), "..");

const has = (f: string) => process.argv.includes(f);
const opts = {
  remote: has("--remote"),
  allowChanges: has("--allow-changes"),
  skipFetch: has("--skip-fetch"),
  noPublish: has("--no-publish"),
  force: has("--force"),
};

/**
 * `--skip-fetch` のときの版。直近の取得結果はコミット済み data/bundle/feeds.json に
 * 残っているので、そこから同じ版を再現できる。一度も取得していなければ版を決められない。
 */
function committedRemote(): RemoteFeed[] | null {
  const p = join(ROOT, "data", "bundle", "feeds.json");
  if (!existsSync(p)) return null;
  const rows = JSON.parse(readFileSync(p, "utf8")) as FeedRow[];
  if (!rows.length || rows.some((r) => !r.fileUid || !r.publishedAt)) return null;
  return rows.map((r) => ({
    id: r.id, organizationId: "", feedId: r.id,
    fileUid: r.fileUid!, publishedAt: r.publishedAt!, fromDate: r.feedStart, fileUrl: "",
  }));
}

/** F-8-5。しきい日数は管理画面(F-7-3)と同じ値を @regen/core から共有する */
function warnExpiring(feeds: FeedRow[]): string[] {
  return feeds
    .map((f) => ({ f, days: daysUntil(f.feedEnd) }))
    .filter((x) => x.days !== null && x.days <= FEED_EXPIRY_WARN_DAYS)
    .map((x) => `${x.f.id}(${x.f.feedEnd} / 残り${x.days}日)`);
}

function bundleSize(b: Bundle): number {
  const objects = [JSON.stringify(b.geojson), ...Object.keys(b.profiles).map((id) =>
    JSON.stringify({ ...b.profiles[id], elev25: b.profiles25[id], schedule: b.schedules[id] })
  )];
  return objects.reduce((n, s) => n + gzipSync(Buffer.from(s)).length, 0);
}

async function main() {
  const startedAt = Date.now();
  const t: CfTarget = { root: ROOT, remote: opts.remote };
  const target = opts.noPublish ? "書き込みなし" : opts.remote ? "本番" : "ローカル";
  console.log(`==> Regen データ更新バッチ(${target})`);

  const sources = loadFeedSources(ROOT);
  const runId = opts.noPublish ? 0 : startRun(t, startedAt);

  try {
    // ---- 1. フィードの版を知る(F-8-1) --------------------------------------
    // 版は入力(フィードのuid + 診断パラメータ)から決まるので、取得の前に分かる。
    // 既に配信中の版と同じなら、ダウンロードも標高も診断もしない
    if (opts.skipFetch) console.log("==> 取得なし(コミット済みzipを使います)");
    else console.log("==> gtfs-data.jp のフィード一覧を取得");

    const fetched: RemoteFeed[] | null = opts.skipFetch ? null : await fetchFeedIndex(sources);
    // --skip-fetch のときは、直近の取得結果(コミット済み feeds.json)から同じ版を再現する
    const remote = fetched ?? committedRemote();

    // 管理画面(F-7-4)のしきい値。版に含めるので、変えれば再計算が走る。
    // --no-publish でも読む(読み取りだけ。D1が無い環境では既定値に落ちる)ので、
    // オフライン確認と本番実行が同じしきい値で回る
    const thresholds = loadThresholds(t);
    if (!isDefaultThresholds(thresholds)) {
      console.log(
        `==> 判定しきい値が既定と異なります: 電池 ${thresholds.fitBattPct}%/${thresholds.condBattPct}% / ` +
        `勾配 ${(thresholds.fitMaxGrade * 100).toFixed(1)}%`
      );
    }
    const version = remote ? computeVersion(remote, thresholds) : null;

    if (version && !opts.noPublish && !opts.force) {
      const current = currentVersion(t);
      if (version === current) {
        console.log(`==> 更新なし(版 ${version})。再計算しません`);
        await touchFeeds(t, sources.map((s) => s.id), Date.now());
        await finishRun(t, runId, "success", {
          feeds: sources.length, version, message: `更新なし(版 ${version})`,
        });
        return;
      }
      console.log(`==> 新しい版 ${version}(現行 ${current ?? "なし"})`);
    }

    // ---- 2. GTFSを手元に用意する --------------------------------------------
    if (fetched) {
      console.log("==> GTFSを取得");
      await downloadFeeds(ROOT, fetched);
    } else {
      extractCommittedZips(ROOT, sources);
    }

    // ---- 3. 診断 -----------------------------------------------------------
    console.log("==> 診断を計算");
    const baseline = loadBaseline(ROOT);
    const bundle = await buildBundle(ROOT, sources, remote ?? undefined, thresholds);

    // ---- 4. 変化ガード ------------------------------------------------------
    let changeNote = "";
    if (baseline) {
      const diff = diffSummary(bundle.summary, baseline);
      if (hasChanges(diff)) {
        changeNote = formatDiff(diff);
        console.log(`==> 公開値に変化があります\n${changeNote}`);
        if (!opts.allowChanges) {
          throw new Error(
            "公開値が前回と変わったため中止しました(旧版は配信されたままです)。" +
            "内容を確認のうえ --allow-changes を付けて再実行してください"
          );
        }
        console.log("==> --allow-changes により変化を承認して続行します");
      } else {
        console.log("==> 公開値は前回と完全一致");
      }
    }

    const gz = bundleSize(bundle);
    console.log(`  R2に載る分の gzip 合計: ${(gz / 1024 / 1024).toFixed(2)} MB`);

    const expiring = warnExpiring(bundle.feeds);
    if (expiring.length) console.log(`==> まもなく期限切れのフィード: ${expiring.join(" / ")}`);

    // ---- 5. 公開(R2 → D1 → 版切替)------------------------------------------
    if (opts.noPublish) {
      console.log("==> --no-publish のためR2/D1には書きません");
    } else {
      if (!version) {
        throw new Error(
          "版を決められません(data/bundle/feeds.json に取得情報がありません)。" +
          "--skip-fetch を外して一度取得してください"
        );
      }
      const res = await publish(t, bundle, version, Date.now(), thresholds);
      console.log(`==> 公開しました: 版 ${res.version} / R2 ${res.objects} オブジェクト / D1 ${res.statements} 文`);
    }

    // ---- 6. 成果物 ----------------------------------------------------------
    // **公開したあとに書く。** data/bundle/ は「いま配信されている内容」であり、
    // 次回の変化ガードの基準でもある。公開前に書くと、公開に失敗した回の差分が
    // 基準に混ざって次回のガードをすり抜けてしまう
    writeArtifacts(ROOT, bundle);

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    const message = [
      `路線 ${bundle.summary.length} / フィード ${bundle.feeds.length} / ${secs}秒 / gzip ${(gz / 1024 / 1024).toFixed(2)}MB`,
      expiring.length ? `期限接近: ${expiring.join(" / ")}` : "",
      changeNote,
    ].filter(Boolean).join("\n");
    await finishRun(t, runId, "success", {
      feeds: bundle.feeds.length, routes: bundle.summary.length, version, message,
    });

    console.log(`==> 完了 ${secs}秒(標高タイル取得 ${fetchedTileCount()} 枚)`);
    // GitHub Actions のコミットメッセージ用
    if (version) console.log(`::version=${version}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishRun(t, runId, "failed", { message });
    throw e;
  }
}

main().catch((e) => {
  console.error(`\n失敗: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
