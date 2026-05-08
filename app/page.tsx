"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type MenuItem = {
  id: string;
  name: string;
  setOrder: number;
  targetWeight: number;
  targetReps: number;
};

type SetRecord = {
  weight: string;
  reps: string;
  rpe: number;
  achieved?: "達成" | "未達" | "部分達成";
  completed: boolean;
};

type ExerciseState = {
  menuItem: MenuItem;
  sets: SetRecord[];
};

type ReviewResult = {
  overall: string;
  achievementRate: number;
  review: string;
  nextInstruction: string;
  nextWeightMemo: string;
};

const DAYS = ["Day1", "Day2", "Day3", "Day4", "Day5", "Day6"];
const TIMER_PRESETS = [60, 90, 120];
const CONDITIONS = ["良好", "普通", "疲れ気味"] as const;

function createDefaultSet(): SetRecord {
  return { weight: "", reps: "", rpe: 7, achieved: undefined, completed: false };
}

function determineAchievement(
  actualWeight: number,
  actualReps: number,
  targetWeight: number,
  targetReps: number
): "達成" | "未達" | "部分達成" {
  const weightOk = actualWeight >= targetWeight;
  const repsOk = actualReps >= targetReps;
  if (weightOk && repsOk) return "達成";
  if (!weightOk && !repsOk) return "未達";
  return "部分達成";
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrainingPage() {
  const [selectedDay, setSelectedDay] = useState("Day1");
  const [exercises, setExercises] = useState<ExerciseState[]>([]);
  const [condition, setCondition] = useState<"良好" | "普通" | "疲れ気味">("普通");
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [timerPreset, setTimerPreset] = useState(90);
  const [timerRemaining, setTimerRemaining] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMenu = useCallback(async (day: string) => {
    setIsLoading(true);
    setError(null);
    setExercises([]);
    try {
      const res = await fetch(`/api/menu?day=${encodeURIComponent(day)}`);
      if (!res.ok) throw new Error("メニューの取得に失敗しました");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExercises(
        data.items.map((item: MenuItem) => ({
          menuItem: item,
          sets: [createDefaultSet(), createDefaultSet(), createDefaultSet()],
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu(selectedDay);
  }, [selectedDay, fetchMenu]);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([300, 100, 300]);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const startTimer = useCallback(
    (seconds?: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      const duration = seconds ?? timerPreset;
      if (seconds) setTimerPreset(seconds);
      setTimerRemaining(duration);
      setTimerRunning(true);
    },
    [timerPreset]
  );

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setTimerRemaining(timerPreset);
  }, [stopTimer, timerPreset]);

  const updateSet = useCallback(
    (exerciseIdx: number, setIdx: number, field: keyof SetRecord, value: unknown) => {
      setExercises((prev) =>
        prev.map((ex, i) =>
          i === exerciseIdx
            ? {
                ...ex,
                sets: ex.sets.map((s, j) =>
                  j === setIdx ? { ...s, [field]: value } : s
                ),
              }
            : ex
        )
      );
    },
    []
  );

  const completeSet = useCallback(
    (exerciseIdx: number, setIdx: number) => {
      const exercise = exercises[exerciseIdx];
      const set = exercise.sets[setIdx];
      const actualWeight = parseFloat(set.weight);
      const actualReps = parseInt(set.reps, 10);
      if (isNaN(actualWeight) || isNaN(actualReps)) return;

      const achieved = determineAchievement(
        actualWeight,
        actualReps,
        exercise.menuItem.targetWeight,
        exercise.menuItem.targetReps
      );

      setExercises((prev) =>
        prev.map((ex, i) =>
          i === exerciseIdx
            ? {
                ...ex,
                sets: ex.sets.map((s, j) =>
                  j === setIdx ? { ...s, achieved, completed: true } : s
                ),
              }
            : ex
        )
      );

      startTimer();
    },
    [exercises, startTimer]
  );

  const addSet = useCallback((exerciseIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exerciseIdx ? { ...ex, sets: [...ex.sets, createDefaultSet()] } : ex
      )
    );
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        day: selectedDay,
        condition,
        memo,
        exercises: exercises
          .map((ex) => ({
            menuItemId: ex.menuItem.id,
            name: ex.menuItem.name,
            targetWeight: ex.menuItem.targetWeight,
            targetReps: ex.menuItem.targetReps,
            sets: ex.sets
              .filter((s) => s.completed)
              .map((s, i) => ({
                setNumber: i + 1,
                weight: parseFloat(s.weight),
                reps: parseInt(s.reps, 10),
                rpe: s.rpe,
                achieved: s.achieved!,
              })),
          }))
          .filter((ex) => ex.sets.length > 0),
      };

      const res = await fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "送信に失敗しました");
      }
      const data = await res.json();
      setReview(data.review);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const achievementBg = (achieved?: string) => {
    if (achieved === "達成") return "bg-green-950 border-l-4 border-green-500";
    if (achieved === "未達") return "bg-red-950 border-l-4 border-red-500";
    if (achieved === "部分達成") return "bg-yellow-950 border-l-4 border-yellow-500";
    return "";
  };

  const achievementBadge = (achieved?: string) => {
    if (achieved === "達成") return "bg-green-600 text-white";
    if (achieved === "未達") return "bg-red-600 text-white";
    if (achieved === "部分達成") return "bg-yellow-600 text-white";
    return "";
  };

  if (review) {
    return (
      <div className="h-full overflow-y-auto bg-black text-white">
        <div className="max-w-lg mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-1 text-center">完了！🎉</h1>
          <p className="text-gray-500 text-sm text-center mb-6">{selectedDay}</p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-900 rounded-2xl p-4 text-center">
              <p className="text-gray-500 text-xs mb-1">総合評価</p>
              <p
                className={`text-xl font-bold ${
                  review.overall === "好調"
                    ? "text-green-400"
                    : review.overall === "要注意"
                    ? "text-red-400"
                    : "text-yellow-400"
                }`}
              >
                {review.overall}
              </p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4 text-center">
              <p className="text-gray-500 text-xs mb-1">達成率</p>
              <p className="text-xl font-bold">{review.achievementRate}%</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 mb-3">
            <h3 className="font-bold text-sm text-gray-400 mb-2">AIレビュー</h3>
            <p className="text-sm leading-relaxed">{review.review}</p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 mb-3">
            <h3 className="font-bold text-sm text-gray-400 mb-2">次回への指示</h3>
            <p className="text-sm leading-relaxed">{review.nextInstruction}</p>
          </div>

          {review.nextWeightMemo && (
            <div className="bg-gray-900 rounded-2xl p-4 mb-6">
              <h3 className="font-bold text-sm text-gray-400 mb-2">重量調整メモ</h3>
              <p className="text-sm leading-relaxed text-gray-300">{review.nextWeightMemo}</p>
            </div>
          )}

          <button
            onClick={() => {
              setReview(null);
              setMemo("");
              fetchMenu(selectedDay);
            }}
            className="w-full bg-white text-black rounded-2xl py-4 text-base font-bold active:bg-gray-200"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black text-white">
      {/* Header: Day tabs + condition */}
      <div className="flex-shrink-0 border-b border-gray-900 bg-black">
        <div className="flex overflow-x-auto scrollbar-hide px-3 py-2 gap-2">
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold min-h-[44px] transition-all ${
                selectedDay === day
                  ? "bg-white text-black"
                  : "bg-gray-900 text-gray-400 active:bg-gray-800"
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        <div className="flex gap-2 px-3 pb-3">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium min-h-[40px] transition-all ${
                condition === c
                  ? "bg-blue-600 text-white"
                  : "bg-gray-900 text-gray-500 active:bg-gray-800"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable exercise list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 pb-48">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-950 border border-red-800 rounded-2xl p-4 text-center">
              <p className="text-red-300 text-sm mb-3">{error}</p>
              <button
                onClick={() => fetchMenu(selectedDay)}
                className="text-red-400 underline text-sm"
              >
                再試行
              </button>
            </div>
          ) : exercises.length === 0 ? (
            <div className="text-center text-gray-600 py-20">
              <p className="text-4xl mb-3">🏋️</p>
              <p>メニューが設定されていません</p>
            </div>
          ) : (
            <>
              {exercises.map((exercise, exIdx) => (
                <div
                  key={exercise.menuItem.id}
                  className="mb-4 bg-gray-900 rounded-2xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-gray-800">
                    <h3 className="font-bold text-base">{exercise.menuItem.name}</h3>
                    <p className="text-gray-400 text-sm mt-0.5">
                      目標: {exercise.menuItem.targetWeight}kg × {exercise.menuItem.targetReps}reps
                    </p>
                  </div>

                  {exercise.sets.map((set, setIdx) => (
                    <div
                      key={setIdx}
                      className={`px-4 py-3 ${set.completed ? achievementBg(set.achieved) : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-500 text-xs font-mono w-10">
                          Set {setIdx + 1}
                        </span>
                        {set.achieved && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${achievementBadge(set.achieved)}`}
                          >
                            {set.achieved}
                          </span>
                        )}
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-gray-600 text-xs">重量(kg)</label>
                          <input
                            type="number"
                            value={set.weight}
                            onChange={(e) => updateSet(exIdx, setIdx, "weight", e.target.value)}
                            placeholder={String(exercise.menuItem.targetWeight)}
                            className="w-full bg-gray-800 rounded-xl px-3 py-2.5 text-white text-base min-h-[44px] placeholder-gray-700 mt-0.5 disabled:opacity-50"
                            inputMode="decimal"
                            disabled={set.completed}
                          />
                        </div>

                        <div className="flex-1">
                          <label className="text-gray-600 text-xs">レップ数</label>
                          <input
                            type="number"
                            value={set.reps}
                            onChange={(e) => updateSet(exIdx, setIdx, "reps", e.target.value)}
                            placeholder={String(exercise.menuItem.targetReps)}
                            className="w-full bg-gray-800 rounded-xl px-3 py-2.5 text-white text-base min-h-[44px] placeholder-gray-700 mt-0.5 disabled:opacity-50"
                            inputMode="numeric"
                            disabled={set.completed}
                          />
                        </div>

                        <div className="w-[72px]">
                          <label className="text-gray-600 text-xs">RPE</label>
                          <select
                            value={set.rpe}
                            onChange={(e) =>
                              updateSet(exIdx, setIdx, "rpe", parseInt(e.target.value, 10))
                            }
                            className="w-full bg-gray-800 rounded-xl px-2 py-2.5 text-white text-base min-h-[44px] mt-0.5 disabled:opacity-50"
                            disabled={set.completed}
                          >
                            {[5, 6, 7, 8, 9, 10].map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>

                        {!set.completed ? (
                          <button
                            onClick={() => completeSet(exIdx, setIdx)}
                            disabled={!set.weight || !set.reps}
                            className="flex-shrink-0 bg-blue-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl px-3 min-h-[44px] text-sm font-bold active:bg-blue-700 transition-colors"
                          >
                            記録
                          </button>
                        ) : (
                          <div className="w-[52px] flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(exIdx)}
                    className="w-full py-3 text-gray-600 text-sm active:text-gray-400"
                  >
                    + セット追加
                  </button>
                </div>
              ))}

              <div className="mt-2">
                <label className="text-gray-600 text-xs">メモ</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="コンディションや気づいたことを記録..."
                  className="w-full mt-1 bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 text-white text-sm min-h-[80px] resize-none placeholder-gray-700"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom: timer + submit */}
      <div className="flex-shrink-0 bg-black border-t border-gray-900 px-3 pt-3 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-gray-600 text-xs whitespace-nowrap">インターバル</span>
          <div className="flex gap-1">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => startTimer(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium min-h-[36px] transition-colors ${
                  timerPreset === preset && timerRunning
                    ? "bg-blue-600 text-white"
                    : "bg-gray-900 text-gray-400 active:bg-gray-800"
                }`}
              >
                {formatTime(preset)}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`text-xl font-mono font-bold tabular-nums ${
                timerRunning && timerRemaining <= 10
                  ? "text-red-400 animate-pulse"
                  : timerRunning
                  ? "text-green-400"
                  : "text-white"
              }`}
            >
              {formatTime(timerRemaining)}
            </span>
            <button
              onClick={timerRunning ? stopTimer : resetTimer}
              className="bg-gray-900 rounded-lg px-3 py-1.5 text-sm text-gray-400 min-h-[36px] active:bg-gray-800"
            >
              {timerRunning ? "停止" : "リセット"}
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-2">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || exercises.length === 0}
          className="w-full bg-white text-black rounded-2xl py-4 text-base font-bold min-h-[52px] disabled:opacity-40 active:bg-gray-200 transition-colors"
        >
          {isSubmitting ? "送信中..." : "トレーニング完了"}
        </button>
      </div>
    </div>
  );
}
