"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_THRESHOLDS, isDefaultThresholds, type Thresholds } from "@regen/core";
import { Button } from "@/app/_components/Button";
import { NumberField } from "@/app/_components/NumberField";
import { formatNumber } from "@/lib/format";
import { DefinitionRow, Section } from "@/app/routes/[id]/_components/sections";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "confirm"; changed: number }
  | { kind: "done"; changed: number }
  | { kind: "error"; message: string };

/**
 * 判定しきい値(F-7-4)。
 *
 * 変更は46路線の判定に及ぶので、**保存前に何路線動くかを出す**(DESIGN §6.8)。
 * 勾配は分数(0.1 = 10%)だが、画面では%で扱う。丸めた%から戻すと
 * 9.95%が10%になって判定が変わるので、**保存する値は%を100で割った素の数**を送る。
 */
export function ThresholdForm({ initial }: { initial: Thresholds }) {
  const router = useRouter();
  const [th, setTh] = useState<Thresholds>(initial);
  const [state, setState] = useState<State>({ kind: "idle" });

  const dirty = JSON.stringify(th) !== JSON.stringify(initial);
  const gradePct = th.fitMaxGrade * 100;

  async function post(dryRun: boolean) {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/admin/settings${dryRun ? "?dryRun=1" : ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(th),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; changed?: number } | null;
      if (!res.ok) {
        setState({ kind: "error", message: body?.error ?? `失敗しました(HTTP ${res.status})` });
        return;
      }
      if (dryRun) setState({ kind: "confirm", changed: body?.changed ?? 0 });
      else {
        setState({ kind: "done", changed: body?.changed ?? 0 });
        router.refresh();
      }
    } catch {
      setState({ kind: "error", message: "通信に失敗しました" });
    }
  }

  return (
    <>
      <Section
        title="判定しきい値"
        caption="この値で46路線すべての判定が決まります。一覧とマップはすぐ、個別の診断書は最大1時間で反映されます。"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="「適」の上限(往復電池)"
            value={th.fitBattPct} unit="%" min={10} max={100} step={1}
            hint={`初期値 ${DEFAULT_THRESHOLDS.fitBattPct}%`}
            onChange={(v) => { setTh({ ...th, fitBattPct: v ?? DEFAULT_THRESHOLDS.fitBattPct }); setState({ kind: "idle" }); }}
          />
          <NumberField
            label="「条件付き」の上限(往復電池)"
            value={th.condBattPct} unit="%" min={10} max={200} step={1}
            hint={`初期値 ${DEFAULT_THRESHOLDS.condBattPct}%。これ以上は「要検討」`}
            onChange={(v) => { setTh({ ...th, condBattPct: v ?? DEFAULT_THRESHOLDS.condBattPct }); setState({ kind: "idle" }); }}
          />
          <NumberField
            label="「適」の勾配上限"
            value={Number(gradePct.toFixed(1))} unit="%" min={2} max={30} step={0.1}
            hint={`初期値 ${DEFAULT_THRESHOLDS.fitMaxGrade * 100}%(500m窓の最急勾配)`}
            onChange={(v) => { setTh({ ...th, fitMaxGrade: (v ?? 10) / 100 }); setState({ kind: "idle" }); }}
          />
        </div>

        <dl className="mt-4">
          <DefinitionRow label="適" value={`往復電池 ${th.fitBattPct}% 未満 かつ 最急勾配 ${formatNumber(gradePct, 1)}% 未満`} />
          <DefinitionRow label="条件付き" value={`往復電池 ${th.condBattPct}% 未満(勾配が上限以上ならここ)`} />
          <DefinitionRow label="要検討" value={`往復電池 ${th.condBattPct}% 以上`} />
          <DefinitionRow label="いまの設定" value={isDefaultThresholds(th) ? "初期値のまま" : "初期値から変更あり"} />
        </dl>

        {state.kind === "error" && (
          <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-verdict-cond-text">
            {state.message}
          </p>
        )}

        {state.kind === "confirm" && (
          <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-ink-2">
            {state.changed === 0 ? (
              <><strong>判定が変わる路線はありません。</strong>このまま保存できます。</>
            ) : (
              <>
                <strong>{state.changed} 路線の判定が変わります。</strong>
                一覧とマップはすぐ変わります。個別の診断書は事前生成されているため、
                反映まで最大1時間かかります。
                <br />
                次のバッチ実行は判定の変化を検出して止まるので、
                <strong>`--allow-changes` を付けた手動実行</strong>が要ります。
              </>
            )}
          </p>
        )}

        {state.kind === "done" && (
          <p className="mt-3 rounded-tile border border-line bg-page p-3 text-aux text-ink-2">
            保存しました({state.changed} 路線の判定を更新)。
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => post(state.kind === "confirm")} disabled={!dirty || state.kind === "busy"}>
            {state.kind === "busy" ? "処理中…" : state.kind === "confirm" ? "この内容で保存する" : "変更を確認する"}
          </Button>
          <Button
            variant="secondary"
            disabled={isDefaultThresholds(th) || state.kind === "busy"}
            onClick={() => { setTh(DEFAULT_THRESHOLDS); setState({ kind: "idle" }); }}
          >
            初期値に戻す
          </Button>
        </div>
      </Section>
    </>
  );
}
