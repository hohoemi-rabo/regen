import { MAX_GRADE, SMOOTH_W, STEP } from "@regen/core";

/**
 * 診断の処理の流れ(要件§9.1)。
 *
 * 家の作法(ElevationChart / TcoChart)に合わせる: 固定viewBox・`var(--token)` のみ・
 * `role="img"` + 文章の `aria-label`。ラスタ画像にしないのは、この図が
 * 「どういう順番で何をしているか」だけを伝えるものだから(拡大しても崩れない方がよい)。
 */
const VW = 840;
const VH = 260;

const COL_W = 150;
const GAP = 22;
const BOX_H = 62;
const ROW1_Y = 46;
const ROW2_Y = 158;

type Step = { title: string; detail: string };

const INPUTS: Step[] = [
  { title: "GTFS", detail: "路線形状・停留所・時刻表" },
  { title: "標高タイル", detail: "国土地理院 10mメッシュ" },
];

const STEPS: Step[] = [
  { title: `${STEP}m にリサンプル`, detail: "経路を等間隔に刻む" },
  { title: "標高を貼る", detail: "双線形補間で1点ずつ" },
  { title: `${SMOOTH_W * STEP}m 平滑化`, detail: "タイルのノイズを均す" },
  { title: "地形の補正", detail: `勾配${MAX_GRADE * 100}%超を削る / 停留所補間` },
];

const OUTPUTS: Step[] = [
  { title: "エネルギー積算", detail: "力行 − 回生 + 空調" },
  { title: "充電計画", detail: "実ダイヤに沿って残量を引く" },
];

function Box({ x, y, step, tone }: { x: number; y: number; step: Step; tone: "input" | "work" | "out" }) {
  const fill = tone === "input" ? "var(--page)" : tone === "out" ? "var(--accent-weak)" : "var(--surface)";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={COL_W}
        height={BOX_H}
        rx="10"
        fill={fill}
        stroke={tone === "out" ? "var(--accent)" : "var(--border)"}
        strokeWidth="1"
      />
      <text x={x + COL_W / 2} y={y + 26} fontSize="13" fontWeight="600" fill="var(--ink-1)" textAnchor="middle">
        {step.title}
      </text>
      <text x={x + COL_W / 2} y={y + 45} fontSize="11" fill="var(--ink-3)" textAnchor="middle">
        {step.detail}
      </text>
    </g>
  );
}

/** 右向きの細い矢印 */
function Arrow({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="var(--baseline)" strokeWidth="1.5" fill="none">
      <line x1={x} y1={y} x2={x + GAP - 8} y2={y} />
      <path d={`M ${x + GAP - 12},${y - 4} L ${x + GAP - 7},${y} L ${x + GAP - 12},${y + 4}`} />
    </g>
  );
}

export function PipelineDiagram() {
  const xOf = (i: number) => 12 + i * (COL_W + GAP);

  return (
    // 幅840のまま縮めると375pxでは文字が5pxになるので、図だけ横スクロールさせる
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="block h-auto w-full min-w-[680px]"
        role="img"
        aria-label={
          `診断の処理の流れ。GTFSの路線形状と国土地理院の標高タイルを入力に、` +
          `経路を${STEP}m間隔にリサンプルし、標高を双線形補間で貼り、${SMOOTH_W * STEP}mの移動平均で平滑化し、` +
          `勾配${MAX_GRADE * 100}%を超える区間をトンネル・高架として補正する。` +
          `そのうえで力行と回生と空調のエネルギーを積算し、実ダイヤに沿って充電計画を出す。`
        }
      >
        {/* 入力(左端に縦に2つ) */}
        <text x={12} y={22} fontSize="11" fill="var(--ink-3)">
          入力(オープンデータ)
        </text>
        <Box x={xOf(0)} y={ROW1_Y} step={INPUTS[0]} tone="input" />
        <Box x={xOf(0)} y={ROW2_Y} step={INPUTS[1]} tone="input" />

        {/* 入力2本を1本にまとめて処理列へ */}
        <g stroke="var(--baseline)" strokeWidth="1.5" fill="none">
          <line x1={xOf(0) + COL_W} y1={ROW1_Y + BOX_H / 2} x2={xOf(0) + COL_W + 11} y2={ROW1_Y + BOX_H / 2} />
          <line x1={xOf(0) + COL_W} y1={ROW2_Y + BOX_H / 2} x2={xOf(0) + COL_W + 11} y2={ROW2_Y + BOX_H / 2} />
          <line x1={xOf(0) + COL_W + 11} y1={ROW1_Y + BOX_H / 2} x2={xOf(0) + COL_W + 11} y2={ROW2_Y + BOX_H / 2} />
        </g>
        <Arrow x={xOf(0) + COL_W + 11} y={(ROW1_Y + ROW2_Y + BOX_H) / 2} />

        {/* 処理(上段) */}
        <text x={xOf(1)} y={22} fontSize="11" fill="var(--ink-3)">
          地形をつくる
        </text>
        {STEPS.slice(0, 3).map((s, i) => (
          <g key={s.title}>
            <Box x={xOf(i + 1)} y={ROW1_Y} step={s} tone="work" />
            {i < 2 && <Arrow x={xOf(i + 1) + COL_W} y={ROW1_Y + BOX_H / 2} />}
          </g>
        ))}

        {/* 上段の右端から下段へ折り返す */}
        <g stroke="var(--baseline)" strokeWidth="1.5" fill="none">
          <line x1={xOf(3) + COL_W} y1={ROW1_Y + BOX_H / 2} x2={xOf(4) - 8} y2={ROW1_Y + BOX_H / 2} />
          <line x1={xOf(4) - 8} y1={ROW1_Y + BOX_H / 2} x2={xOf(4) - 8} y2={ROW2_Y + BOX_H / 2} />
          <line x1={xOf(4) - 8} y1={ROW2_Y + BOX_H / 2} x2={xOf(3) + COL_W + 8} y2={ROW2_Y + BOX_H / 2} />
          <path
            d={`M ${xOf(3) + COL_W + 13},${ROW2_Y + BOX_H / 2 - 4} L ${xOf(3) + COL_W + 8},${ROW2_Y + BOX_H / 2} L ${xOf(3) + COL_W + 13},${ROW2_Y + BOX_H / 2 + 4}`}
          />
        </g>

        {/* 補正 + 出力(下段・左詰めに戻す) */}
        <text x={xOf(1)} y={ROW2_Y - 14} fontSize="11" fill="var(--ink-3)">
          数字にする
        </text>
        <Box x={xOf(1)} y={ROW2_Y} step={STEPS[3]} tone="work" />
        <Arrow x={xOf(1) + COL_W} y={ROW2_Y + BOX_H / 2} />
        <Box x={xOf(2)} y={ROW2_Y} step={OUTPUTS[0]} tone="out" />
        <Arrow x={xOf(2) + COL_W} y={ROW2_Y + BOX_H / 2} />
        <Box x={xOf(3)} y={ROW2_Y} step={OUTPUTS[1]} tone="out" />
      </svg>
    </div>
  );
}
