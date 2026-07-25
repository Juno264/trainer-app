import type { ExercisePlan, ExerciseState, SetInput } from "./types";

const round2_5 = (x: number) => Math.round(x / 2.5) * 2.5;

/**
 * トレーニング実施用の種目一覧。保留中（hold）を除外する。
 * 管理画面など全種目を扱う画面ではこれを使わないこと。
 */
export function activeExercises(plans: ExercisePlan[]): ExercisePlan[] {
  return plans.filter((p) => p.tier !== "hold");
}

/**
 * 種目プランからセット配列を生成する。
 * ウォームアップセット数 > 0 かつ重量種目なら、目標重量の50〜80%を初期値として
 * 充填したウォームアップセットを先頭に追加する（ユーザーは編集可能）。
 * ウォームアップは達成判定・記録保存の対象外（ウォームアップ:true）。
 */
export function buildSets(plan: ExercisePlan): SetInput[] {
  const n = plan.ウォームアップセット数 ?? 0;
  const warm: SetInput[] = [];
  if (n > 0 && plan.目標重量kg > 0) {
    for (let i = 0; i < n; i++) {
      const pct = n === 1 ? 0.6 : 0.5 + (0.3 * i) / (n - 1); // 50% → 80%
      warm.push({
        重量kg: round2_5(plan.目標重量kg * pct),
        レップ数: Math.max(5, plan.目標レップ数 - 2),
        ウォームアップ: true,
      });
    }
  }
  const work: SetInput[] = Array.from({ length: plan.セット数 }, () => ({
    重量kg: "",
    レップ数: "",
  }));
  return [...warm, ...work];
}

export function makeExerciseState(plan: ExercisePlan): ExerciseState {
  return {
    plan,
    sets: buildSets(plan),
    rpe: 7,
    memo: "",
    expanded: false,
  };
}
