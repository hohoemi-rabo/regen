/**
 * 読み込んだCSVを、当てはめに使える行に組み立てる(F-4-3)。
 *
 * ここも**ブラウザ内で完結する**。ネットワークに触るものを import しない。
 */
import { auxWForMonth, cruiseSpeedKmh } from "@regen/core";
import { toHours, toMonth, toNumber, type FieldKey } from "./csv";

/** 消費量の単位。EVは電力量、ディーゼルは軽油 */
export type Unit = "kwh" | "liters";

/** 突き合わせの土台にする路線。地形はこの1路線を前提にする */
export interface RouteBasis {
  id: string;
  name: string;
  agency: string;
  lengthM: number;
  /** 片道の力行・回生 [kWh] */
  tractionKwh: number;
  regenKwh: number;
  /** 冬の電費 [kWh/km](空調項の逆算に使う) */
  kwhPerKm: number;
}

export interface PreparedRow {
  /** CSVの何行目か(見出しを1行目として数える。エラー表示用) */
  line: number;
  month: number;
  km: number;
  hours: number;
  /** 実測の消費量(kWh または L) */
  observed: number;
  /** 距離・地形に比例する項 [kWh] */
  mechKwh: number;
  /** 時間に比例する項 [kWh] */
  auxKwh: number;
  /** この行の推定値(補正前) */
  predicted: number;
}

export interface SkippedRow {
  line: number;
  reason: string;
}

export interface PrepareResult {
  rows: PreparedRow[];
  skipped: SkippedRow[];
  /** 夏と冬の行がそろっているか(2係数に分離できるかの目安) */
  hasBothSeasons: boolean;
  /** 運行時間の列が使えたか */
  usedDuration: boolean;
}

export type ColumnMap = Record<FieldKey, number>;

/**
 * 1行ずつ検証して組み立てる。読めない行は理由つきで飛ばし、画面に出す
 * (黙って捨てると「なぜ件数が合わないのか」が分からなくなる)。
 */
export function prepareRows(
  csvRows: string[][],
  cols: ColumnMap,
  basis: RouteBasis,
  unit: Unit
): PrepareResult {
  const lengthKm = basis.lengthM / 1000;
  // 片道の空調項 [kWh] を電費から逆算し、時間あたりに直す
  const mechPerKm = (basis.tractionKwh - basis.regenKwh) / lengthKm;
  const tripHours = lengthKm / cruiseSpeedKmh(basis.lengthM);

  const rows: PreparedRow[] = [];
  const skipped: SkippedRow[] = [];
  const months = new Set<number>();
  let usedDuration = false;

  csvRows.forEach((r, i) => {
    const line = i + 2; // 見出しが1行目
    const month = toMonth(r[cols.date] ?? "");
    if (month === null) {
      skipped.push({ line, reason: `日付を読み取れません(${r[cols.date] ?? ""})` });
      return;
    }
    const km = toNumber(r[cols.distance] ?? "");
    if (km === null || km <= 0) {
      skipped.push({ line, reason: `走行距離が数値ではありません(${r[cols.distance] ?? ""})` });
      return;
    }
    const observed = toNumber(r[cols.consumption] ?? "");
    if (observed === null || observed <= 0) {
      skipped.push({ line, reason: `消費量が数値ではありません(${r[cols.consumption] ?? ""})` });
      return;
    }

    // 運行時間の列があればそれを使う。無ければ表定速度から出す。
    // 実時間があると空調項が距離と独立に動くので、2係数に分離しやすくなる
    let hours: number | null = null;
    if (cols.duration >= 0) hours = toHours(r[cols.duration] ?? "");
    if (hours !== null && hours > 0) usedDuration = true;
    else hours = (km / lengthKm) * tripHours;

    const mechKwh = mechPerKm * km;
    const auxKwh = (auxWForMonth(month) * hours) / 1000;
    months.add(month);
    rows.push({ line, month, km, hours, observed, mechKwh, auxKwh, predicted: mechKwh + auxKwh });
  });

  const winter = [...months].some((m) => m >= 12 || m <= 3);
  const summer = [...months].some((m) => m >= 4 && m <= 11);
  // ディーゼルは季節を使わないので、分離の話は電力量のときだけ意味を持つ
  return { rows, skipped, hasBothSeasons: unit === "kwh" && winter && summer, usedDuration };
}
