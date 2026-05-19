"use client";
import { useState, useEffect } from "react";
import type { ExercisePlan, ExerciseState } from "../lib/types";

type Props = {
  recommendedBodyPart: string;
  selectedExercises: ExerciseState[];
  onStart: (exercises: ExerciseState[]) => void;
  onBack: () => void;
};

const BODY_PARTS = ["胸・肩・三頭", "背中・二頭", "脚・お尻", "有酸素（プール）"];
const MAX_PARTS = 3;

function makeExerciseState(plan: ExercisePlan): ExerciseState {
  return {
    plan,
    sets: Array.from({ length: plan.セット数 }, () => ({ 重量kg: "", レップ数: "" })),
    rpe: 7,
    memo: "",
    expanded: false,
  };
}

export default function CustomEditView({ recommendedBodyPart, selectedExercises, onStart, onBack }: Props) {
  const [allByPart, setAllByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedParts, setSelectedParts] = useState<string[]>([recommendedBodyPart]);
  const [selected, setSelected] = useState<ExerciseState[]>(selectedExercises);

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setAllByPart(data); })
      .finally(() => setLoading(false));
  }, []);

  const togglePart = (part: string) => {
    if (selectedParts.includes(part)) {
      if (selectedParts.length === 1) return;
      const partIds = new Set((allByPart[part] ?? []).map((p) => p.id));
      setSelected((prev) => prev.filter((ex) => !partIds.has(ex.plan.id)));
      setSelectedParts((prev) => prev.filter((p) => p !== part));
    } else {
      if (selectedParts.length >= MAX_PARTS) return;
      setSelectedParts((prev) => [...prev, part]);
    }
  };

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
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="flex items-center gap-3 mt-2">
          <button onClick={onBack} className="text-zinc-400 text-lg">←</button>
          <div>
            <div className="text-xs text-zinc-500">カスタム編集</div>
            <div className="text-lg font-bold">{selectedParts.join(" + ")}</div>
          </div>
        </div>

        {/* 部位選択チップ（最大3つ） */}
        <div className="flex flex-wrap gap-2 mt-3">
          {BODY_PARTS.map((part) => {
            const active = selectedParts.includes(part);
            const disabled = !active && selectedParts.length >= MAX_PARTS;
            return (
              <button
                key={part}
                onClick={() => togglePart(part)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : disabled
                    ? "bg-zinc-800/40 text-zinc-600"
                    : "bg-zinc-800 text-zinc-400 active:bg-zinc-700"
                }`}
              >{part}</button>
            );
          })}
        </div>
        {selectedParts.length >= MAX_PARTS && (
          <div className="text-xs text-zinc-600 mt-1.5">最大{MAX_PARTS}部位まで選択できます</div>
        )}
      </div>

      <div className="flex-1 px-4 py-3 space-y-4">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-zinc-500 text-sm animate-pulse">読み込み中...</div>
          </div>
        )}

        {!loading && (
          <>
            {/* 選択中の種目 */}
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

            {/* 追加できる種目（部位ごとにグループ） */}
            <div>
              <div className="text-xs text-zinc-500 mb-2">追加する</div>
              {selectedParts.map((part) => {
                const unselected = (allByPart[part] ?? []).filter((ex) => !isIncluded(ex.id));
                if (unselected.length === 0) return null;
                return (
                  <div key={part} className="mb-4">
                    {selectedParts.length > 1 && (
                      <div className="text-xs text-zinc-600 mb-1.5 px-1">{part}</div>
                    )}
                    <div className="space-y-2">
                      {unselected.map((plan) => (
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
                );
              })}
            </div>
          </>
        )}
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
