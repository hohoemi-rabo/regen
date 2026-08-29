import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 国土地理院 標高タイル(10m, z14)の取得とローカルキャッシュ、双線形補間 */
const Z = 14;
const CACHE = join(process.cwd(), ".cache", "dem");
const tiles = new Map<string, (number | null)[][] | null>();

async function getTile(x: number, y: number): Promise<(number | null)[][] | null> {
  const key = x + "_" + y;
  if (tiles.has(key)) return tiles.get(key)!;
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, Z + "-" + key + ".txt");
  let text: string | null = null;
  if (existsSync(file)) {
    text = readFileSync(file, "utf-8");
  } else {
    const url = "https://cyberjapandata.gsi.go.jp/xyz/dem/" + Z + "/" + x + "/" + y + ".txt";
    const res = await fetch(url);
    if (res.ok) {
      text = await res.text();
      writeFileSync(file, text);
    }
  }
  const grid = text
    ? text.trim().split("\n").map((row) => row.split(",").map((c) => (c === "e" ? null : parseFloat(c))))
    : null;
  tiles.set(key, grid);
  return grid;
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
    const t = await getTile(gx >> 8, gy >> 8);
    return t ? t[gy & 255][gx & 255] : null;
  };
  const vs = [await cell(x0, y0), await cell(x0 + 1, y0), await cell(x0, y0 + 1), await cell(x0 + 1, y0 + 1)];
  const ok = vs.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (ok.length === 0) return null;
  if (ok.length < 4) return ok[0];
  const [a, b, c, d] = vs as number[];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
