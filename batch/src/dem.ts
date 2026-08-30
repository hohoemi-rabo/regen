import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 国土地理院 標高タイル(10m, z14)の取得とローカルキャッシュ、双線形補間。
 *
 * キャッシュ(F-8-2)は `batch/.cache/dem/`。GitHub Actions では actions/cache でこの
 * ディレクトリごと持ち回す。同一タイルは二度取らない。
 * **補間の数式は変えないこと** — Python版と一致していることがゴールデンテストの前提。
 */
const Z = 14;
const CACHE = join(process.cwd(), ".cache", "dem");
/** 同時取得数。地理院タイルへの礼儀として控えめにする */
const CONCURRENCY = 6;
const RETRIES = 3;

const tiles = new Map<string, (number | null)[][] | null>();
let fetched = 0;

const tileKey = (x: number, y: number) => `${x}_${y}`;
const tilePath = (key: string) => join(CACHE, `${Z}-${key}.txt`);
/**
 * 「そのタイルは存在しない」ことの印。
 * これが無いと、海上や範囲外の404タイルを実行のたびに取り直してしまう。
 */
const missPath = (key: string) => join(CACHE, `${Z}-${key}.miss`);

function parse(text: string): (number | null)[][] {
  return text.trim().split("\n").map((row) => row.split(",").map((c) => (c === "e" ? null : parseFloat(c))));
}

/** ディスクキャッシュから読む。未取得なら undefined、取得済みの404なら null */
function fromDisk(key: string): (number | null)[][] | null | undefined {
  if (existsSync(missPath(key))) return null;
  const p = tilePath(key);
  return existsSync(p) ? parse(readFileSync(p, "utf-8")) : undefined;
}

async function download(x: number, y: number): Promise<string | null> {
  const url = `https://cyberjapandata.gsi.go.jp/xyz/dem/${Z}/${x}/${y}.txt`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      // 404 は「そのタイルは無い」という正常な答え。リトライしない
      if (res.status === 404) return null;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1)));
  }
  throw new Error(`標高タイルの取得に失敗しました ${Z}/${x}/${y}: ${lastErr}`);
}

async function loadTile(x: number, y: number): Promise<(number | null)[][] | null> {
  const key = tileKey(x, y);
  const cached = tiles.get(key);
  if (cached !== undefined) return cached;

  mkdirSync(CACHE, { recursive: true });
  const disk = fromDisk(key);
  if (disk !== undefined) {
    tiles.set(key, disk);
    return disk;
  }

  const text = await download(x, y);
  fetched++;
  if (text === null) {
    writeFileSync(missPath(key), "");
    tiles.set(key, null);
    return null;
  }
  writeFileSync(tilePath(key), text);
  const grid = parse(text);
  tiles.set(key, grid);
  return grid;
}

/** 緯度経度 → その点の補間に要るタイル座標(最大4枚) */
function tilesFor(lat: number, lon: number): [number, number][] {
  const n = 2 ** Z * 256;
  const lr = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * n;
  const py = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const x0 = Math.floor(px - 0.5);
  const y0 = Math.floor(py - 0.5);
  const out = new Set<string>();
  for (const [gx, gy] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
    out.add(tileKey(gx >> 8, gy >> 8));
  }
  return [...out].map((k) => k.split("_").map(Number) as [number, number]);
}

/**
 * 使うタイルを先に並列で集める。
 * elevAt を1点ずつ await すると取得が直列になり、初回実行が桁違いに遅い。
 */
export async function prefetchTiles(points: { lat: number[]; lon: number[] }[]): Promise<void> {
  const need = new Map<string, [number, number]>();
  for (const p of points) {
    for (let i = 0; i < p.lat.length; i++) {
      for (const [x, y] of tilesFor(p.lat[i], p.lon[i])) need.set(tileKey(x, y), [x, y]);
    }
  }
  const queue = [...need.values()].filter(([x, y]) => tiles.get(tileKey(x, y)) === undefined);
  const cold = queue.filter(([x, y]) => fromDisk(tileKey(x, y)) === undefined).length;
  console.log(`  標高タイル: 必要 ${need.size} 枚 / うち未取得 ${cold} 枚`);

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        const [x, y] = queue[next++];
        await loadTile(x, y);
      }
    })
  );
}

/** このプロセスがネットワークから取ったタイル枚数(実行ログ用) */
export function fetchedTileCount(): number {
  return fetched;
}

/** 緯度経度→標高(双線形補間、Python版と同一) */
export async function elevAt(lat: number, lon: number): Promise<number | null> {
  const n = 2 ** Z * 256;
  const lr = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * n;
  const py = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const x0 = Math.floor(px - 0.5);
  const y0 = Math.floor(py - 0.5);
  const fx = px - 0.5 - x0;
  const fy = py - 0.5 - y0;
  const cell = async (gx: number, gy: number) => {
    const t = await loadTile(gx >> 8, gy >> 8);
    return t ? t[gy & 255][gx & 255] : null;
  };
  const vs = [await cell(x0, y0), await cell(x0 + 1, y0), await cell(x0, y0 + 1), await cell(x0 + 1, y0 + 1)];
  const ok = vs.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (ok.length === 0) return null;
  if (ok.length < 4) return ok[0];
  const [a, b, c, d] = vs as number[];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
