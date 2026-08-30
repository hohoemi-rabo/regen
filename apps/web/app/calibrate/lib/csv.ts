/**
 * ブラウザ内で完結するCSVの読み取り(F-4-1 / F-4-2)。
 *
 * **このファイルの値をネットワークに出さない。** fetch も Server Action も import しない
 * (CLAUDE.md #5 / 要件§5.3)。
 *
 * デジタコや給油記録の書き出しはShift_JISのことが多いので、UTF-8で読んで文字化けしたら
 * Shift_JISで読み直す。BOMは落とす。
 */

/** これ以上は読まない。実運用の月次データなら数十KBで足りる */
export const MAX_BYTES = 5 * 1024 * 1024;
/** 1ファイルの行数上限(壊れたファイルでブラウザを固めない) */
export const MAX_ROWS = 20000;

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  /** 実際に使ったエンコーディング(画面に出して、文字化けの相談をしやすくする) */
  encoding: "utf-8" | "shift_jis";
}

export class CsvError extends Error {}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** UTF-8で読んで置換文字が出たらShift_JISで読み直す */
export function decode(buf: ArrayBuffer): { text: string; encoding: "utf-8" | "shift_jis" } {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return { text: stripBom(utf8), encoding: "utf-8" };
  try {
    const sjis = new TextDecoder("shift_jis").decode(buf);
    if (!sjis.includes("�")) return { text: stripBom(sjis), encoding: "shift_jis" };
  } catch {
    // このブラウザが shift_jis を持っていない。UTF-8の結果で続ける
  }
  return { text: stripBom(utf8), encoding: "utf-8" };
}

/** 引用符・埋め込み改行・CRLF に対応した最小のCSVパーサ(依存を足さない) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    // 空行(全セルが空)は捨てる
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i++;
    } else if (c === ",") {
      endField();
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      endRow();
      if (rows.length > MAX_ROWS) throw new CsvError(`行が多すぎます(${MAX_ROWS}行まで)`);
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** ファイルを読んでヘッダ行 + データ行に分ける */
export async function readCsvFile(file: File): Promise<ParsedCsv> {
  if (file.size === 0) throw new CsvError("ファイルが空です");
  if (file.size > MAX_BYTES) {
    throw new CsvError(
      `ファイルが大きすぎます(${(file.size / 1024 / 1024).toFixed(1)} MB)。` +
        `${MAX_BYTES / 1024 / 1024} MB までにしてください`
    );
  }
  const { text, encoding } = decode(await file.arrayBuffer());
  const all = parseCsv(text);
  if (all.length === 0) throw new CsvError("読み取れる行がありません");
  if (all.length === 1) {
    throw new CsvError("見出し行しかありません。データ行を含むCSVを読み込んでください");
  }

  const header = all[0];
  const width = header.length;
  if (width < 3) {
    throw new CsvError(`列が${width}しかありません。日付・走行距離・消費量の3列以上が要ります`);
  }
  // 列数がぶれる行は幅に揃える(デジタコの書き出しは末尾が欠けることがある)
  const rows = all
    .slice(1)
    .map((r) => (r.length === width ? r : Array.from({ length: width }, (_, k) => r[k] ?? "")));
  return { header, rows, encoding };
}

// ---------------------------------------------------------------------------
// 値の解釈
// ---------------------------------------------------------------------------

/** "1,234.5" "1 234" "12.3km" → 12.3。数値にならなければ null */
export function toNumber(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "").replace(/[^\d.+-].*$/, "");
  if (s === "" || s === "-" || s === "+" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const checkMonth = (m: number) => (m >= 1 && m <= 12 ? m : null);

/**
 * 日付から月(1-12)を取る。季節の判定にしか使わないので月が分かれば十分。
 * "2026-01-05" "2026/1/5" "20260105" "2026年1月5日" "1/5" に対応する。
 */
export function toMonth(raw: string): number | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/年.](\d{1,2})/.exec(s))) return checkMonth(Number(m[2]));
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return checkMonth(Number(m[2]));
  if ((m = /^(\d{1,2})[-/](\d{1,2})/.exec(s))) return checkMonth(Number(m[1])); // 月/日
  return null;
}

/** "8:30" "8時間30分" "8.5" → 8.5 [時間]。数値だけなら時間とみなす */
export function toHours(raw: string): number | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d+):(\d{1,2})/.exec(s))) return Number(m[1]) + Number(m[2]) / 60;
  if ((m = /^(\d+)\s*時間\s*(\d+)?/.exec(s))) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  return toNumber(s);
}

// ---------------------------------------------------------------------------
// 列の推定
// ---------------------------------------------------------------------------

export type FieldKey = "date" | "distance" | "consumption" | "duration";

/**
 * よくある見出し語。デジタコの実データが読めなかったら、ここに語を足すだけで済むようにしておく。
 * 前方から順に見て最初に当たった列を採用する。
 */
const HINTS: Record<FieldKey, string[]> = {
  date: ["日付", "年月日", "運行日", "date", "day", "日時"],
  distance: ["走行距離", "距離", "走行キロ", "運行距離", "km", "distance", "odo"],
  consumption: ["消費電力量", "電力量", "消費量", "給油量", "燃料", "軽油", "kwh", "liter", "litre", "fuel", "l"],
  duration: ["運行時間", "走行時間", "拘束時間", "時間", "duration", "hours"],
};

/** 見出し行から各項目の列indexを推定する。当たらなければ -1 */
export function guessColumns(header: string[]): Record<FieldKey, number> {
  const lower = header.map((h) => h.toLowerCase().trim());
  const used = new Set<number>();
  const pick = (key: FieldKey): number => {
    for (const hint of HINTS[key]) {
      const i = lower.findIndex((h, k) => !used.has(k) && h.includes(hint));
      if (i >= 0) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };
  // 取り違えにくい順に決める(「時間」は「日時」と紛れるので日付を先に取る)
  const date = pick("date");
  const duration = pick("duration");
  const distance = pick("distance");
  const consumption = pick("consumption");
  return { date, distance, consumption, duration };
}
