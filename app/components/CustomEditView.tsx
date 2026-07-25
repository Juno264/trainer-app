"use client";
import { useState, useEffect, useRef } from "react";
import type { ExercisePlan, ExerciseState } from "../lib/types";
import { makeExerciseState, activeExercises } from "../lib/session";
import { formatWeight } from "../lib/load";

type Props = {
  recommendedBodyPart: string;
  selectedExercises: ExerciseState[];
  onStart: (exercises: ExerciseState[]) => void;
  onBack: () => void;
};

const BODY_PARTS = ["胸・肩・三頭", "背中・二頭", "脚・お尻", "有酸素（プール）"];
const MAX_PARTS = 3;
const ITEM_H = 68; // px: approximate height of each selected-item row including gap

export default function CustomEditView({ recommendedBodyPart, selectedExercises, onStart, onBack }: Props) {
  const [allByPart, setAllByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedParts, setSelectedParts] = useState<string[]>([recommendedBodyPart]);
  const [selected, setSelected] = useState<ExerciseState[]>(selectedExercises);

  // ── ドラッグ並び替え ─────────────────────────────────────────────────────
  const selectedRef = useRef<ExerciseState[]>(selected);
  selectedRef.current = selected;

  const dragRef = useRef<{
    currentIdx: number;
    adjustedStartY: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchInitRef = useRef<{ x: number; y: number; idx: number } | null>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const endDrag = () => {
    cancelLongPress();
    dragRef.current = null;
    touchInitRef.current = null;
    setDragIdx(null);
    setDragOffsetY(0);
  };

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      // 長押し待機中：移動が大きければキャンセル
      if (longPressTimerRef.current && touchInitRef.current) {
        const dx = Math.abs(touch.clientX - touchInitRef.current.x);
        const dy = Math.abs(touch.clientY - touchInitRef.current.y);
        if (dx > 8 || dy > 8) cancelLongPress();
        return;
      }

      const dr = dragRef.current;
      if (!dr) return;
      e.preventDefault();

      const fingerY = touch.clientY;
      const delta = fingerY - dr.adjustedStartY;
      const steps = Math.round(delta / ITEM_H);
      const len = selectedRef.current.length;
      const targetIdx = Math.max(0, Math.min(len - 1, dr.currentIdx + steps));

      if (targetIdx !== dr.currentIdx) {
        const next = [...selectedRef.current];
        const [item] = next.splice(dr.currentIdx, 1);
        next.splice(targetIdx, 0, item);
        setSelected(next);
        dr.adjustedStartY += (targetIdx - dr.currentIdx) * ITEM_H;
        dr.currentIdx = targetIdx;
        setDragIdx(targetIdx);
        setDragOffsetY(fingerY - dr.adjustedStartY);
      } else {
        setDragOffsetY(delta);
      }
    };

    const onTouchEnd = () => endDrag();

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
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

      {/* スクロール可能なコンテンツ */}
      <div
        className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide px-4 py-3 pb-8 space-y-4"
        style={dragIdx !== null ? { touchAction: "none" } : undefined}
      >
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
                  {selected.map((ex, idx) => {
                    const isDragging = dragIdx === idx;
                    return (
                      <div
                        key={ex.plan.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-3 select-none [-webkit-user-select:none] [-webkit-touch-callout:none] ${
                          isDragging
                            ? "bg-blue-900/40 border border-blue-700/50 shadow-2xl shadow-blue-900/40"
                            : "bg-zinc-900 border border-transparent"
                        }`}
                        style={{
                          transition:
                            "scale 180ms ease-out, box-shadow 200ms ease-out, background-color 200ms ease-out, border-color 200ms ease-out",
                          ...(isDragging
                            ? {
                                translate: `0 ${dragOffsetY}px`,
                                scale: "1.04",
                                position: "relative",
                                zIndex: 50,
                              }
                            : {}),
                        }}
                      >
                        {/* ドラッグハンドル（長押しで並び替え起動） */}
                        <div
                          className="flex items-center justify-center w-8 h-10 touch-none select-none [-webkit-user-select:none] [-webkit-touch-callout:none] cursor-grab active:cursor-grabbing flex-shrink-0"
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            const touch = e.touches[0];
                            touchInitRef.current = { x: touch.clientX, y: touch.clientY, idx };
                            longPressTimerRef.current = setTimeout(() => {
                              longPressTimerRef.current = null;
                              const initY = touchInitRef.current?.y ?? touch.clientY;
                              dragRef.current = { currentIdx: idx, adjustedStartY: initY };
                              setDragIdx(idx);
                              setDragOffsetY(0);
                              if (navigator.vibrate) navigator.vibrate(40);
                            }, 350);
                          }}
                        >
                          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" className={isDragging ? "text-blue-400" : "text-zinc-500"} aria-hidden="true">
                            <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
                            <circle cx="10" cy="6"  r="1.5" fill="currentColor"/>
                            <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
                            <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                            <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
                            <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{ex.plan.種目名}</span>
                            {ex.plan.tier === "bonus" && (
                              <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">任意</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {formatWeight(ex.plan.目標重量kg, ex.plan.負荷タイプ)} ×{" "}
                            {ex.plan.目標レップ数}rep × {ex.plan.セット数}set
                          </div>
                        </div>

                        <button
                          onClick={() => toggle(ex.plan)}
                          className="w-8 h-8 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center text-lg flex-shrink-0"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 追加できる種目（部位ごとにグループ） */}
            <div>
              <div className="text-xs text-zinc-500 mb-2">追加する</div>
              {selectedParts.map((part) => {
                // 保留中(hold)の種目は追加候補に出さない
                const unselected = activeExercises(allByPart[part] ?? []).filter((ex) => !isIncluded(ex.id));
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
                          className="w-full flex items-center gap-3 bg-zinc-900/50 rounded-xl px-3 py-3 text-left active:bg-zinc-800"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center text-lg flex-shrink-0">＋</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{plan.種目名}</span>
                              {plan.tier === "bonus" && (
                                <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full leading-none">任意</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {formatWeight(plan.目標重量kg, plan.負荷タイプ)} ×{" "}
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

      {/* フッター */}
      <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-safe-bottom">
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
