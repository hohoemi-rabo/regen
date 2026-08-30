/**
 * 診断パラメータのスナップショット。
 *
 * 版の算出(feeds.ts)と D1 `bundles.params_json` の両方がこれを使う。
 * アルゴリズムのパラメータを変えれば版が変わり、R2のキー接頭辞も変わるので、
 * F-6の共有シナリオが固定した過去の版の数字は動かない。
 */
import {
  STEP, MAX_GRADE, SMOOTH_W, GRADE_WIN, DEFAULT_EV, SUMMER_AUX_W, WINTER_AUX_W,
  DEFAULT_THRESHOLDS, type Thresholds,
} from "@regen/core";

/**
 * パイプライン自体の版。
 * パラメータは同じでも成果物の作り方(間引き・丸め・収録項目)を変えたときに上げる。
 */
export const PIPELINE_REV = 4;

/**
 * @param thresholds 管理画面で変えられる判定しきい値(F-7-4)。
 *   **版に含める。** 含めないと、しきい値を変えても版が変わらず、更新検出の
 *   早期リターンで再計算されないまま古い判定が配信され続ける。
 */
export function paramsSnapshot(thresholds: Thresholds = DEFAULT_THRESHOLDS) {
  return {
    pipelineRev: PIPELINE_REV,
    step: STEP,
    maxGrade: MAX_GRADE,
    smoothW: SMOOTH_W,
    gradeWin: GRADE_WIN,
    summerAuxW: SUMMER_AUX_W,
    winterAuxW: WINTER_AUX_W,
    vehicle: DEFAULT_EV,
    thresholds,
  };
}
