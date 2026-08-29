/**
 * 数値フォーマッタ(DESIGN §3.3)。
 * 3桁区切り + 小数桁は用途ごとに固定: 電費2桁 / 距離1桁 / 標高・電力量0桁。
 */
export function formatNumber(value: number, digits: number): string {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 電費(kWh/km): 2桁固定 例 0.85 */
export const formatKwhPerKm = (v: number) => formatNumber(v, 2);

/** 距離(km): 1桁固定 例 36.8 */
export const formatKm = (v: number) => formatNumber(v, 1);

/** 標高(m)・電力量(kWh)など: 0桁 + 3桁区切り 例 1,196 */
export const formatInt = (v: number) => formatNumber(Math.round(v), 0);
