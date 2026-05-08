"use client";
import { useState } from "react";
import type { ExercisePlan, ExerciseState } from "../lib/types";

type Props = {
  bodyPart: string;
  allExercises: ExercisePlan[];
  selectedExercises: ExerciseState[];
  onStart: (exercises: ExerciseState[]) => void;
  onBack: () => void;
};

function makeExerciseState(plan: ExercisePlan): ExerciseState {
  return {
    plan,
    sets: Array.from({ length: plan.セット数 }, () => ({
      重量kg: plan.目標重量kg,
      レップ数: plan.目標レップ数,
    })),
    rpe: 7,
    memo: "",
    expanded: false,
  };
}

export default function CustomEditView({ bodyPart, allExercises, selectedExercises, onStart, onBack }: Props) {
  const [selected, setSelected] = useState<ExerciseState[]>(selectedExercises);

  const isIncluded = (id: string) => selected.some((ex) => ex.plan.id === id);

  const toggle = (plan: ExercisePlan) => {
    if (isIncluded(plan.id)) {
      setSelected((prev) => prev.filter((ex) => ex.plan.id !== plan.id));
    } else {
      setSelected((prev) => [...prev, makeExerciseState(plan)]);
    }
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    if (idx === selected.length - 1) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white pb-32">
      <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="flex items-center gap-3 mt-2">
          <button onClick={onBack} className="text-zinc-400 text-lg">←</button>
          <div>
            <div className="text-xs text-zinc-500">カスタム編集</div>
            <div className="text-lg font-bold">{bodyPart}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4">
        {/* 選択中の種目（並び替え可能） */}
        {selected.length > 0 && (
          <div>
            <div className="text-xs text-zinc-500 mb-2">選択中（{selected.length}種目）</div>
            <div className="space-y-2">
              {selected.map((ex, idx) => (
                <div key={ex.plan.id} className="flex items-center gap-2 bg-zinc-900 rounded-xl px-3 py-3">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveUp(idx)} className="text-zinc-500 text-xs leading-none h-5">▲</button>
                    <button onClick={() => moveDown(idx)} className="text-zinc-500 text-xs leading-none h-5">▼</button>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{ex.plan.種目名}</div>
                    <div className="text-xs text-zinc-500">
                      {ex.plan.目標重量kg > 0 ? `${ex.plan.目標重量kg}kg × ` : "自重 × "}
                      {ex.plan.目標レップ数}rep × {ex.plan.セット数}set
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(ex.plan)}
                    className="w-8 h-8 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center text-lg"
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 追加できる種目 */}
        <div>
          <div className="text-xs text-zinc-500 mb-2">追加する</div>
          <div className="space-y-2">
            {allExercises.filter((ex) => !isIncluded(ex.id)).map((plan) => (
              <button
                key={plan.id}
                onClick={() => toggle(plan)}
                className="w-full flex items-center gap-3 bg-zinc-900/50 rounded-xl px-3 py-3 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-lg flex-shrink-0">＋</div>
                <div>
                  <div className="font-medium text-sm">{plan.種目名}</div>
                  <div className="text-xs text-zinc-500">
                    {plan.目標重量kg > 0 ? `${plan.目標重量kg}kg × ` : "自重 × "}
                    {plan.目標レップ数}rep × {plan.セット数}set
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-safe-bottom">
        <button
          onClick={() => onStart(selected)}
          disabled={selected.length === 0}
          className="w-full py-4 rounded-xl text-base font-bold bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          このメニューで開始（{selected.length}種目）
        </button>
      </div>
    </div>
  );
}
