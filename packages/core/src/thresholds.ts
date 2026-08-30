/**
 * 判定しきい値(F-7-4)。
 *
 * 既定値は要件定義書§5「判定基準(初期値、設定で変更可)」の数値そのもの。
 * **既定値を変えない。** 変えると46路線の判定が動き、ゴールデンテストが落ちる
 * (管理画面からの変更はD1の settings に載り、既定値には触れない)。
 */

export interface Thresholds {
  /** 「適」の上限。冬季往復のバッテリー使用率 [%] 未満 */
  fitBattPct: number;
  /** 「条件付き」の上限。これ以上は「要検討」 */
  condBattPct: number;
  /** 「適」の勾配上限。**分数**(0.1 = 10%)。%へ丸めた値から戻さないこと */
  fitMaxGrade: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  fitBattPct: 60,
  condBattPct: 85,
  fitMaxGrade: 0.1,
};

/** 管理画面で入力できる範囲。ここを緩めると判定の意味が壊れる */
export const THRESHOLD_RANGES = {
  fitBattPct: [10, 100],
  condBattPct: [10, 200],
  fitMaxGrade: [0.02, 0.3],
} as const;

export function isDefaultThresholds(t: Thresholds): boolean {
  return (
    t.fitBattPct === DEFAULT_THRESHOLDS.fitBattPct &&
    t.condBattPct === DEFAULT_THRESHOLDS.condBattPct &&
    t.fitMaxGrade === DEFAULT_THRESHOLDS.fitMaxGrade
  );
}

/**
 * 保存値の正規形への詰め替え。壊れていれば null。
 * D1の settings は管理画面から書かれるので、読み出し側でも必ず通す。
 */
export function normalizeThresholds(raw: unknown): Thresholds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const num = (v: unknown, range: readonly [number, number]): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= range[0] && v <= range[1] ? v : null;

  const fitBattPct = num(o.fitBattPct, THRESHOLD_RANGES.fitBattPct);
  const condBattPct = num(o.condBattPct, THRESHOLD_RANGES.condBattPct);
  const fitMaxGrade = num(o.fitMaxGrade, THRESHOLD_RANGES.fitMaxGrade);
  if (fitBattPct === null || condBattPct === null || fitMaxGrade === null) return null;

  // 「適」の上限が「条件付き」の上限を超えると、条件付きが存在しなくなる
  if (fitBattPct > condBattPct) return null;
  return { fitBattPct, condBattPct, fitMaxGrade };
}

/**
 * GTFSフィードの期限が近いと警告する日数(F-8-5)。
 * バッチ(実行時の警告)と管理画面(表示)の両方が同じ値を見る。
 */
export const FEED_EXPIRY_WARN_DAYS = 60;

/** 期限までの残り日数。feedEnd は "YYYY-MM-DD"。期限が無ければ null */
export function daysUntil(feedEnd: string | null | undefined, now = Date.now()): number | null {
  if (!feedEnd) return null;
  const end = Date.parse(`${feedEnd}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  return Math.floor((end - now) / 86400_000);
}
