/**
 * GTFSフィードの取得と更新検出(F-8-1)。
 *
 * 取得元は GTFSデータリポジトリ(gtfs-data.jp)の公開API。認証は要らない。
 *   GET https://api.gtfs-data.jp/v2/files  … 全フィードの現行ファイル(uid・公開日時・zip直URL)
 *
 * 対象は `data/feeds.source.json` に列挙した南信州11フィードだけ。
 * APIの feed_id はハイフン入り(Minamishinshu-takagi-1)、こちらのIDはハイフン無し
 * (Minamishinshutakagi1)で表記が違う。**機械的にハイフンを落とす実装にしない** —
 * 路線IDは `<feedId>_<route_id>` で、1文字ずれると共有URLとブックマークが全部死ぬ。
 * 対応表は人が管理する。
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { paramsSnapshot } from "./snapshot";
import type { Thresholds } from "@regen/core";

const API = "https://api.gtfs-data.jp/v2/files";

export interface FeedSource {
  /** このリポジトリでの正本ID。D1 feeds.id / 路線IDの接頭辞と同じ */
  id: string;
  organizationId: string;
  /** gtfs-data.jp 側のfeed_id */
  feedId: string;
}

export interface RemoteFeed extends FeedSource {
  /** 公開ファイルのUUID。更新検出の鍵 */
  fileUid: string;
  /** ISO8601。版の日付部分に使う */
  publishedAt: string;
  /** YYYY-MM-DD。zipのファイル名に入れる(gtfs-data.jp の配布名に合わせる) */
  fromDate: string | null;
  fileUrl: string;
}

export function loadFeedSources(root: string): FeedSource[] {
  const list = JSON.parse(readFileSync(join(root, "data", "feeds.source.json"), "utf8")) as FeedSource[];
  if (!list.length) throw new Error("data/feeds.source.json が空です");
  return list;
}

/** APIの現行ファイル一覧を引き、マニフェストの並び順に揃えて返す */
export async function fetchFeedIndex(sources: FeedSource[]): Promise<RemoteFeed[]> {
  const res = await fetch(API, { headers: { "accept-encoding": "gzip" } });
  if (!res.ok) throw new Error(`gtfs-data.jp API が ${res.status} を返しました`);
  const body = (await res.json()) as { body: Record<string, string>[] };
  const byKey = new Map(body.body.map((f) => [`${f.organization_id}/${f.feed_id}`, f]));

  return sources.map((s) => {
    const f = byKey.get(`${s.organizationId}/${s.feedId}`);
    if (!f) throw new Error(`APIに見つかりません: ${s.organizationId}/${s.feedId}(廃止された可能性があります)`);
    if (!f.file_uid || !f.file_url) throw new Error(`公開ファイルがありません: ${s.feedId}`);
    return {
      ...s,
      fileUid: f.file_uid,
      publishedAt: f.file_published_at,
      fromDate: f.file_from_date ?? null,
      fileUrl: f.file_url,
    };
  });
}

/**
 * 版を入力から導出する。同一入力なら同一版になり、再実行は冪等な上書きになる
 * (受入条件「再実行しても同一入力なら同一出力」)。
 */
export function computeVersion(feeds: RemoteFeed[], thresholds?: Thresholds): string {
  const published = feeds.map((f) => f.publishedAt).sort();
  const date = published[published.length - 1].slice(0, 10).replace(/-/g, "");
  const material = JSON.stringify({
    feeds: [...feeds].sort((a, b) => a.id.localeCompare(b.id)).map((f) => [f.id, f.fileUid]),
    params: paramsSnapshot(thresholds),
  });
  const hash = createHash("sha256").update(material).digest("hex").slice(0, 8);
  return `${date}-${hash}`;
}

/**
 * gtfs-data.jp の配布名と同じ形にする。
 * 中身が変わっていなければ名前も変わらないので、コミット済みzipに差分が出ない。
 */
function zipName(f: RemoteFeed): string {
  const stamp = f.publishedAt.replace(/[-:T]/g, "").slice(0, 14);
  const from = (f.fromDate ?? "").replace(/-/g, "");
  return `feed_${f.organizationId}_${f.id}_${from}_${stamp}.zip`;
}

/** 展開先に既にあるファイルを消してから書く(前の版の余りを残さない) */
function extractTo(dir: string, zip: Uint8Array) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = unzipSync(zip);
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith("/") || bytes.length === 0) continue;
    // GTFSのzipは平ら(サブディレクトリを持たない)。持っていたら基底名だけ取る
    writeFileSync(join(dir, name.split("/").pop()!), bytes);
  }
}

/**
 * zipを取得して `data/gtfs_zips/` に置き、`data/gtfs/<id>/` へ展開する。
 * 同じフィードの古いzipは消す(ファイル名に公開日時が入るため溜まってしまう)。
 */
export async function downloadFeeds(root: string, feeds: RemoteFeed[]): Promise<void> {
  const zipDir = join(root, "data", "gtfs_zips");
  const gtfsDir = join(root, "data", "gtfs");
  mkdirSync(zipDir, { recursive: true });
  mkdirSync(gtfsDir, { recursive: true });

  for (const f of feeds) {
    const res = await fetch(f.fileUrl);
    if (!res.ok) throw new Error(`zipの取得に失敗しました: ${f.feedId} (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const name = zipName(f);
    for (const old of readdirSync(zipDir)) {
      if (old.startsWith(`feed_${f.organizationId}_${f.id}_`) && old !== name) {
        rmSync(join(zipDir, old));
      }
    }
    writeFileSync(join(zipDir, name), bytes);
    extractTo(join(gtfsDir, f.id), bytes);
    console.log(`  ${f.id}: ${(bytes.length / 1024).toFixed(0)} KB (公開 ${f.publishedAt.slice(0, 10)})`);
  }
}

/** --skip-fetch 用。コミット済みzipから展開だけする(ネットワークに触らない) */
export function extractCommittedZips(root: string, sources: FeedSource[]): void {
  const zipDir = join(root, "data", "gtfs_zips");
  const gtfsDir = join(root, "data", "gtfs");
  mkdirSync(gtfsDir, { recursive: true });
  const zips = existsSync(zipDir) ? readdirSync(zipDir) : [];

  for (const s of sources) {
    const zip = zips.find((z) => z.startsWith(`feed_${s.organizationId}_${s.id}_`));
    if (!zip) throw new Error(`コミット済みzipがありません: ${s.id}(--skip-fetch を外して取得してください)`);
    extractTo(join(gtfsDir, s.id), new Uint8Array(readFileSync(join(zipDir, zip))));
  }
  console.log(`  コミット済みzip ${sources.length} 件を展開しました`);
}
