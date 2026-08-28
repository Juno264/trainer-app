"use client";
import { useState, useEffect, useRef } from "react";
import type { ExerciseState, Condition, ReviewResult } from "../lib/types";
import { formatWeight, formatWeightShort } from "../lib/load";

type Props = {
  bodyPart: string;
  exercises: ExerciseState[];
  setExercises: (fn: (prev: ExerciseState[]) => ExerciseState[]) => void;
  condition: Condition;
  setCondition: (c: Condition) => void;
  onComplete: (review: ReviewResult) => void;
  onCancel: () => void;
  onPause: () => void;
};

const CONDITIONS: Condition[] = ["良好", "普通", "疲れ気味"];
const TIMER_PRESETS = [60, 90, 120];

export default function TrainingView({ bodyPart, exercises, setExercises, condition, setCondition, onComplete, onCancel, onPause }: Props) {
  const [showBackMenu, setShowBackMenu] = useState(false);
  const [timerPreset, setTimerPreset] = useState(90);
  const [timerLeft, setTimerLeft] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteConfirm, setShowIncompleteConfirm] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let startY = 0;
    let isBouncing = false;
    const onTouchStart = (e: TouchEvent) => {
      // アニメーション途中でも現在位置から再開できるよう計算済みtransformを固定
      const computed = getComputedStyle(el).transform;
      el.style.transition = "";
      if (computed !== "none") el.style.transform = computed;
      startY = e.touches[0].clientY;
      isBouncing = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollHeight > el.clientHeight + 2) return;
      const deltaY = e.touches[0].clientY - startY;
      e.preventDefault();
      isBouncing = true;
      const damped = Math.sign(deltaY) * Math.pow(Math.abs(deltaY), 0.65) * 2.5;
      el.style.transform = `translateY(${damped}px)`;
    };
    const onTouchEnd = () => {
      if (!isBouncing) return;
      isBouncing = false;
      // 1フレーム待ってから遷移を開始することでガクつきを防ぐ
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform = "translateY(0)";
        setTimeout(() => { if (el) el.style.transition = ""; }, 700);
      });
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        setTimerLeft((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  const startTimer = (preset: number) => {
    setTimerPreset(preset);
    setTimerLeft(preset);
    setTimerRunning(true);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerLeft(timerPreset);
  };

  const toggleExpand = (i: number) => {
    setExercises((prev) => prev.map((ex, idx) => idx === i ? { ...ex, expanded: !ex.expanded } : ex));
  };

  const updateSet = (exIdx: number, setIdx: number, field: "重量kg" | "レップ数", value: string) => {
    const num = value === "" ? "" : parseFloat(value);
    setExercises((prev) => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: num }),
    }));
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: [...ex.sets, { 重量kg: "", レップ数: "" }],
    }));
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.filter((_, j) => j !== setIdx),
    }));
  };

  const updateRpe = (exIdx: number, rpe: number) => {
    setExercises((prev) => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, rpe }));
  };

  const updateMemoEx = (exIdx: number, m: string) => {
    setExercises((prev) => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, memo: m }));
  };

  const isAchieved = (set: { 重量kg: number | ""; レップ数: number | "" }, plan: ExerciseState["plan"]) => {
    const w = typeof set.重量kg === "number" ? set.重量kg : 0;
    const r = typeof set.レップ数 === "number" ? set.レップ数 : 0;
    return w >= plan.目標重量kg && r >= plan.目標レップ数;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // 実施した＝ウォームアップ以外に1つでも入力のあるセットがある
  const hasAnyInput = (ex: ExerciseState) =>
    ex.sets.some((s) => !s.ウォームアップ && (s.重量kg !== "" || s.レップ数 !== ""));

  // 未記録の必須種目。任意(bonus)は未実施でも警告しない
  const unrecordedCore = exercises.filter(
    (ex) => ex.plan.tier === "core" && !hasAnyInput(ex)
  );

  // 完了確認に出す集計。記録対象は本番セットのうち入力のある行だけ
  const recordedSets = exercises.flatMap((ex) =>
    ex.sets.filter((s) => !s.ウォームアップ && (s.重量kg !== "" || s.レップ数 !== ""))
  );
  const recordedExerciseCount = exercises.filter(hasAnyInput).length;
  const achievedSetCount = exercises.reduce(
    (n, ex) =>
      n +
      ex.sets.filter(
        (s) => !s.ウォームアップ && s.重量kg !== "" && s.レップ数 !== "" && isAchieved(s, ex.plan)
      ).length,
    0
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // ウォームアップセットは記録・分析の対象外。
      // 両方未入力のセット行は「実施しなかった」ものとして送らない
      // （送ると0kg×0repの記録が残り、前回値や統計を汚すため）。
      const records = exercises.map((ex) => ({
        id: ex.plan.id,
        種目名: ex.plan.種目名,
        sets: ex.sets
          .filter((s) => !s.ウォームアップ)
          .filter((s) => s.重量kg !== "" || s.レップ数 !== "")
          .map((s) => ({
            重量kg: typeof s.重量kg === "number" ? s.重量kg : 0,
            レップ数: typeof s.レップ数 === "number" ? s.レップ数 : 0,
            目標重量kg: ex.plan.目標重量kg,
            目標レップ数: ex.plan.目標レップ数,
            達成: isAchieved(s, ex.plan),
          })),
        RPE: ex.rpe,
        体調: condition,
        メモ: ex.memo,
      }));

      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          部位: bodyPart,
          実施日: new Date().toISOString().split("T")[0],
          records,
        }),
      });
      const data = await res.json();
      onComplete(data);
    } catch (e) {
      console.error(e);
      alert("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
      {/* 完了確認。誤送信を防ぐため、記録が揃っていても必ず一段階挟む。
          未記録があるときは「戻る」を主ボタンにして、反射的なタップで送信されないようにする */}
      {showIncompleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70" onClick={() => setShowIncompleteConfirm(false)}>
          <div className="w-full bg-zinc-900 rounded-t-2xl px-4 pt-5 pb-safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-zinc-300 mb-1">
              {unrecordedCore.length > 0 ? "必須種目に未記録があります" : "この内容で完了しますか？"}
            </div>
            <div className="text-xs text-zinc-500 mb-3">
              送信すると記録が保存され、レビューが生成されます。あとから追加で送っても、
              同じ種目・同じセット番号は上書きされません。
            </div>

            <div className="bg-zinc-800/60 rounded-xl px-3 py-2.5 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">{bodyPart}</span>
                <span className="text-zinc-300">
                  {recordedExerciseCount}種目 / {recordedSets.length}セット
                  <span className="text-zinc-500 ml-1.5">（達成{achievedSetCount}）</span>
                </span>
              </div>
            </div>

            {unrecordedCore.length > 0 && (
              <>
                <div className="text-xs text-amber-400/90 mb-1.5">
                  以下の必須種目は未記録のまま、未達として達成率に反映されます
                </div>
                <div className="bg-amber-950/25 border border-amber-800/40 rounded-xl px-3 py-2 mb-4 space-y-1">
                  {unrecordedCore.map((ex) => (
                    <div key={ex.plan.id} className="text-xs text-amber-200/90">・{ex.plan.種目名}</div>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-2">
              {unrecordedCore.length > 0 ? (
                <>
                  <button
                    onClick={() => setShowIncompleteConfirm(false)}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold bg-blue-600 active:bg-blue-700"
                  >
                    戻って入力する
                  </button>
                  <button
                    onClick={() => { setShowIncompleteConfirm(false); handleSubmit(); }}
                    className="w-full py-3.5 rounded-xl text-sm text-zinc-400 active:bg-zinc-800"
                  >
                    未記録のまま完了する
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setShowIncompleteConfirm(false); handleSubmit(); }}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold bg-blue-600 active:bg-blue-700"
                  >
                    完了して送信する
                  </button>
                  <button
                    onClick={() => setShowIncompleteConfirm(false)}
                    className="w-full py-3.5 rounded-xl text-sm text-zinc-400 active:bg-zinc-800"
                  >
                    戻る
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 戻る確認モーダル */}
      {showBackMenu && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70" onClick={() => setShowBackMenu(false)}>
          <div className="w-full bg-zinc-900 rounded-t-2xl px-4 pt-5 pb-safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-zinc-300 mb-1">トレーニングを中断しますか？</div>
            <div className="text-xs text-zinc-500 mb-4">入力済みのデータはまだ保存されていません</div>
            <div className="space-y-2">
              <button
                onClick={onPause}
                className="w-full py-3.5 rounded-xl text-sm font-semibold bg-blue-600 active:bg-blue-700"
              >
                データを保持してホームへ
              </button>
              <button
                onClick={onCancel}
                className="w-full py-3.5 rounded-xl text-sm font-semibold bg-zinc-800 text-red-400 active:bg-zinc-700"
              >
                キャンセル（データを破棄）
              </button>
              <button
                onClick={() => setShowBackMenu(false)}
                className="w-full py-3.5 rounded-xl text-sm text-zinc-400 active:bg-zinc-800"
              >
                トレーニングを続ける
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex-shrink-0 relative z-10 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => setShowBackMenu(true)} className="text-zinc-400 text-lg">←</button>
          <div>
            <div className="text-xs text-zinc-500">トレーニング中</div>
            <div className="text-lg font-bold">{bodyPart}</div>
          </div>
        </div>
        {/* 体調選択 */}
        <div className="flex gap-2 mt-2">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${condition === c ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"}`}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* 種目カード */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide px-4 py-3 space-y-3">
        {exercises.map((ex, exIdx) => {
          const isCardio = ex.plan.部位 === "有酸素（プール）";
          const isBonus = ex.plan.tier === "bonus";
          // 必須→任意の切り替わり位置に見出しを挿入する
          const showBonusHeading = isBonus && exercises[exIdx - 1]?.plan.tier !== "bonus";
          // ウォームアップは先頭に連続して並ぶ。達成判定・件数は本番セットのみで数える
          const workingSets = ex.sets.filter((s) => !s.ウォームアップ);
          const warmupCount = ex.sets.length - workingSets.length;
          const allSetsHaveData = workingSets.every(
            (s) => s.重量kg !== "" && s.レップ数 !== ""
          );
          const achievedSets = workingSets.filter((s) => isAchieved(s, ex.plan)).length;
          const totalSets = workingSets.length;

          const headerSub = isCardio
            ? `${ex.plan.目標重量kg > 0 ? ex.plan.目標重量kg + "m × " : ""}${ex.plan.目標レップ数}本 × ${ex.plan.セット数}set`
            : `${formatWeight(ex.plan.目標重量kg, ex.plan.負荷タイプ)} × ${ex.plan.目標レップ数}rep × ${ex.plan.セット数}set${warmupCount > 0 ? `（+W${warmupCount}）` : ""}`;

          return (
            <div key={ex.plan.id}>
              {showBonusHeading && (
                <div className="pt-4 pb-2 border-t border-zinc-800 mt-1">
                  <div className="text-xs font-medium text-zinc-400">ボーナス</div>
                  <div className="text-xs text-zinc-600 mt-0.5">余力があれば。達成率には影響しません</div>
                </div>
              )}
              <div
                className={`rounded-xl overflow-hidden ${
                  isBonus ? "bg-zinc-900/50 border border-dashed border-zinc-700" : "bg-zinc-900"
                }`}
              >
                {/* カードヘッダー（タップで展開） */}
                <button
                  onClick={() => toggleExpand(exIdx)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isBonus ? "text-zinc-400" : ""}`}>{ex.plan.種目名}</span>
                      {isBonus && (
                        <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                          任意
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 ${isBonus ? "text-zinc-600" : "text-zinc-400"}`}>
                      {headerSub}
                      {allSetsHaveData && (
                        <span className={`ml-2 ${achievedSets === totalSets ? "text-green-400" : achievedSets > 0 ? "text-yellow-400" : "text-red-400"}`}>
                          ({achievedSets}/{totalSets}達成)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-zinc-500 text-lg">{ex.expanded ? "▲" : "▼"}</span>
                </button>

              {/* 実施指示。折り畳みの中に入れると読まれないまま実施されるため、
                  カードの展開状態と関係なく常時表示する */}
              {ex.plan.指示 && (
                <div className="mx-4 mb-3 bg-amber-950/25 border border-amber-800/40 rounded-lg px-3 py-2">
                  <div className="text-xs leading-relaxed text-amber-200/90 whitespace-pre-wrap break-words">
                    {ex.plan.指示}
                  </div>
                </div>
              )}

              {ex.expanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* セットリスト */}
                  <div className="space-y-2">
                    {/* ヘッダー行 */}
                    <div className="grid grid-cols-[2rem_1fr_1.5rem_1fr_1.5rem_2rem] gap-1.5 text-xs text-zinc-500 px-1">
                      <div>Set</div>
                      <div>
                        {isCardio ? "距離(m)" : ex.plan.負荷タイプ === "bodyweight" ? "自重±kg" : "重量(kg)"}
                      </div>
                      <div />
                      <div>{isCardio ? "本数" : "回数"}</div>
                      <div />
                      <div />
                    </div>
                    {/* 目標行 */}
                    <div className="grid grid-cols-[2rem_1fr_1.5rem_1fr_1.5rem_2rem] gap-1.5 items-center text-xs text-zinc-500 bg-zinc-800/50 rounded-lg px-2 py-1.5">
                      <div>目標</div>
                      <div className="text-center">{isCardio ? (ex.plan.目標重量kg > 0 ? `${ex.plan.目標重量kg}m` : "-") : formatWeightShort(ex.plan.目標重量kg, ex.plan.負荷タイプ)}</div>
                      <div />
                      <div className="text-center">{ex.plan.目標レップ数}{isCardio ? "本" : ""}</div>
                      <div />
                      <div />
                    </div>
                    {/* 前回実績行（セットごと） */}
                    {ex.plan.前回セット.map((ps, pi) => (
                      <div key={pi} className="grid grid-cols-[2rem_1fr_1.5rem_1fr_1.5rem_2rem] gap-1.5 items-center text-xs text-blue-400/70 px-2 py-0.5">
                        <div className="text-blue-400/50">{pi === 0 ? "前回" : ""}</div>
                        <div className="text-center">{isCardio ? (ps.重量kg > 0 ? `${ps.重量kg}m` : "-") : formatWeightShort(ps.重量kg, ex.plan.負荷タイプ)}</div>
                        <div />
                        <div className="text-center">{ps.レップ数}{isCardio ? "本" : "rep"}</div>
                        <div />
                        <div />
                      </div>
                    ))}
                    {ex.sets.map((set, setIdx) => {
                      const isWarmup = !!set.ウォームアップ;
                      const achieved = !isWarmup && isAchieved(set, ex.plan);
                      const hasData = set.重量kg !== "" && set.レップ数 !== "";
                      const setLabel = isWarmup ? `W${setIdx + 1}` : `${setIdx - warmupCount + 1}`;
                      // 重量コピー元
                      const weightSrc = setIdx === 0
                        ? (ex.plan.前回セット[0]?.重量kg ?? null)
                        : (ex.sets[setIdx - 1].重量kg !== "" ? ex.sets[setIdx - 1].重量kg : null);
                      // 回数コピー元
                      const repsSrc = setIdx === 0
                        ? (ex.plan.前回セット[0]?.レップ数 ?? null)
                        : (ex.sets[setIdx - 1].レップ数 !== "" ? ex.sets[setIdx - 1].レップ数 : null);
                      const rowClass = isWarmup
                        ? "bg-amber-950/25 border border-amber-800/40"
                        : hasData
                        ? achieved
                          ? "bg-green-950/60 border border-green-800"
                          : "bg-red-950/60 border border-red-800"
                        : "bg-zinc-800/30";
                      return (
                        <div
                          key={setIdx}
                          className={`grid grid-cols-[2rem_1fr_1.5rem_1fr_1.5rem_2rem] gap-1.5 items-center rounded-lg px-2 py-1.5 ${rowClass}`}
                        >
                          <div className={`text-sm font-medium ${isWarmup ? "text-amber-400/80 text-xs" : ""}`}>{setLabel}</div>
                          <input
                            type="number"
                            inputMode="decimal"
                            autoComplete="off"
                            value={set.重量kg}
                            onChange={(e) => updateSet(exIdx, setIdx, "重量kg", e.target.value)}
                            onFocus={() => { if (!timerRunning && setIdx > 0) { setTimerLeft(timerPreset); setTimerRunning(true); } }}
                            placeholder={ex.plan.目標重量kg !== 0 ? String(ex.plan.目標重量kg) : "0"}
                            className="bg-zinc-700 rounded-md px-1 py-2 text-sm w-full text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          {weightSrc !== null ? (
                            <button
                              onClick={() => updateSet(exIdx, setIdx, "重量kg", String(weightSrc))}
                              className="flex items-center justify-center h-8 w-full text-zinc-400 text-sm active:text-white"
                            >↑</button>
                          ) : <div />}
                          <input
                            type="number"
                            inputMode="numeric"
                            autoComplete="off"
                            value={set.レップ数}
                            onChange={(e) => updateSet(exIdx, setIdx, "レップ数", e.target.value)}
                            placeholder={String(ex.plan.目標レップ数)}
                            className="bg-zinc-700 rounded-md px-1 py-2 text-sm w-full text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          {repsSrc !== null ? (
                            <button
                              onClick={() => updateSet(exIdx, setIdx, "レップ数", String(repsSrc))}
                              className="flex items-center justify-center h-8 w-full text-zinc-400 text-sm active:text-white"
                            >↑</button>
                          ) : <div />}
                          <button
                            onClick={() => removeSet(exIdx, setIdx)}
                            className="text-zinc-500 text-lg leading-none flex items-center justify-center"
                          >×</button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => addSet(exIdx)}
                      className="w-full py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm"
                    >＋ セット追加</button>

                    {/* 自重種目は符号の意味を明示する（アシストを正の数で入れる誤りを防ぐ） */}
                    {!isCardio && ex.plan.負荷タイプ === "bodyweight" && (
                      <div className="text-xs text-zinc-600 px-1 leading-relaxed">
                        自重を基準に <span className="text-zinc-400">±</span> で入力（
                        <span className="text-zinc-400">-40</span> = アシスト40kg /{" "}
                        <span className="text-zinc-400">+10</span> = 加重10kg / 空欄 = 自重のみ）
                      </div>
                    )}
                  </div>

                  {/* RPE */}
                  <div>
                    <div className="text-xs text-zinc-500 mb-1.5">RPE（きつさ）</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                        <button
                          key={n}
                          onClick={() => updateRpe(exIdx, n)}
                          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${ex.rpe === n
                            ? n <= 6 ? "bg-green-600" : n <= 8 ? "bg-yellow-600" : "bg-red-600"
                            : "bg-zinc-800 text-zinc-400"}`}
                        >{n}</button>
                      ))}
                    </div>
                  </div>

                  {/* メモ */}
                  <div>
                    <div className="text-xs text-zinc-500 mb-1.5">メモ</div>
                    <textarea
                      value={ex.memo}
                      onChange={(e) => updateMemoEx(exIdx, e.target.value)}
                      placeholder="任意"
                      rows={2}
                      className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      {/* フッター（タイマー＋完了ボタン） */}
      <div className="flex-shrink-0 relative z-10 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-safe-bottom">
        {/* タイマー */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <span className="text-xs text-zinc-500 self-center">インターバル</span>
            {TIMER_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => startTimer(p)}
                className={`px-3 py-1.5 rounded-lg text-sm ${timerPreset === p && timerRunning ? "bg-blue-600" : "bg-zinc-800 text-zinc-400"}`}
              >{fmt(p)}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xl font-mono font-bold ${timerRunning ? (timerLeft <= 10 ? "text-red-400" : "text-white") : "text-zinc-500"}`}>
              {fmt(timerLeft)}
            </span>
            <button onClick={resetTimer} className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded-md">
              ↺
            </button>
          </div>
        </div>

        {/* 完了ボタン */}
        <button
          onClick={() => setShowIncompleteConfirm(true)}
          disabled={submitting}
          className="w-full py-4 rounded-xl text-base font-bold bg-blue-600 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "送信中..." : "トレーニング完了"}
        </button>
      </div>
    </div>
  );
}
