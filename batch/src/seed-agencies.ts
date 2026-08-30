/**
 * D1の agencies / feeds に入れる素を GTFS から取り出して data/seed/ に固める。
 *
 * data/gtfs/ は .gitignore なので、クリーンクローンでもシードできるように
 * ここで一度JSONに落としてコミットする(他の data/seed/*.json と同じ扱い)。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";

const ROOT = join(process.cwd(), "..");
const GTFS = join(ROOT, "data", "gtfs");
const SEED = join(ROOT, "data", "seed");

export interface AgencyRow {
  /** feed_id + "_" + agency_id。飯田市は2フィードにまたがるので複合にする(要件§6.1) */
  id: string;
  name: string;
  feedId: string;
}

export interface FeedRow {
  id: string;
  name: string;
  sourceUrl: string;
  /** YYYY-MM-DD。GTFSは YYYYMMDD なので変換する */
  feedStart: string | null;
  feedEnd: string | null;
}

const rd = (dir: string, file: string) => {
  const p = join(GTFS, dir, file);
  return existsSync(p) ? parseCsv(readFileSync(p, "utf8")) : [];
};

/** GTFSの YYYYMMDD を YYYY-MM-DD に。空なら null */
function toDate(v: string | undefined): string | null {
  if (!v || v.length !== 8) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

if (!existsSync(GTFS)) {
  throw new Error(
    `${GTFS} がありません。data/gtfs_zips/*.zip を data/gtfs/ に展開してから実行してください(README参照)`
  );
}

const feedDirs = readdirSync(GTFS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const agencies: AgencyRow[] = [];
const feeds: FeedRow[] = [];

for (const feedId of feedDirs) {
  const agency = rd(feedId, "agency.txt")[0];
  if (!agency) throw new Error(`${feedId}/agency.txt が読めません`);
  const agencyId = agency.agency_id || feedId;
  agencies.push({
    id: `${feedId}_${agencyId}`,
    name: agency.agency_name,
    feedId,
  });

  const info = rd(feedId, "feed_info.txt")[0];
  feeds.push({
    id: feedId,
    name: info?.feed_publisher_name || agency.agency_name,
    sourceUrl: info?.feed_publisher_url || agency.agency_url || "",
    feedStart: toDate(info?.feed_start_date),
    feedEnd: toDate(info?.feed_end_date),
  });
}

writeFileSync(join(SEED, "agencies.json"), JSON.stringify(agencies, null, 2) + "\n");
writeFileSync(join(SEED, "feeds.json"), JSON.stringify(feeds, null, 2) + "\n");

console.log(`agencies: ${agencies.length}件 -> data/seed/agencies.json`);
console.log(`feeds:    ${feeds.length}件 -> data/seed/feeds.json`);
const expiring = feeds
  .filter((f) => f.feedEnd && f.feedEnd < "2027-01-11")
  .map((f) => `${f.id}(${f.feedEnd})`);
if (expiring.length) console.log(`  応募締切前に期限切れするフィード: ${expiring.join(" / ")}`);
