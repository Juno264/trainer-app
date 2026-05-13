"use client";
import { useState, useEffect } from "react";
import type { ExercisePlan, ExerciseState, RecommendData, Condition, ReviewResult } from "./lib/types";
import TrainingView from "./components/TrainingView";
import CustomEditView from "./components/CustomEditView";
import HistoryView from "./components/HistoryView";

type Screen = "loading" | "recommend" | "custom" | "training" | "review" | "history";

function makeState(plan: ExercisePlan): ExerciseState {
  return {
    plan,
    sets: Array.from({ length: plan.セット数 }, () => ({
      重量kg: "",
      レップ数: "",
    })),
    rpe: 7,
    memo: "",
    expanded: false,
  };
}

const BODY_PART_EMOJI: Record<string, string> = {
  "胸・三頭": "💪",
  "背中・二頭": "🦾",
  "脚・お尻": "🦵",
  "肩・腕": "💥",
  "有酸素（プール）": "🏊",
};

const RATING_COLOR: Record<string, string> = {
  好調: "text-green-400",
  普通: "text-yellow-400",
  要注意: "text-red-400",
};

const RATING_EMOJI: Record<string, string> = {
  好調: "🔥",
  普通: "✅",
  要注意: "⚠️",
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [recommendation, setRecommendation] = useState<RecommendData | null>(null);
  const [exercises, setExercises] = useState<ExerciseState[]>([]);
  const [condition, setCondition] = useState<Condition>("普通");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommend();
  }, []);

  const fetchRecommend = async () => {
    setScreen("loading");
    setError(null);
    try {
      const res = await fetch("/api/recommend");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || d.error || "エラー");
      }
      const data: RecommendData = await res.json();
      setRecommendation(data);
      setExercises(data.種目リスト.map(makeState));
      setScreen("recommend");
    } catch (e) {
      setError(String(e));
      setScreen("recommend");
    }
  };

  const handleStart = () => setScreen("training");
  const handleCustomEdit = () => setScreen("custom");

  const handleCustomStart = (selected: ExerciseState[]) => {
    setExercises(selected);
    setScreen("training");
  };

  const handleComplete = (r: ReviewResult) => {
    setReview(r);
    setScreen("review");
  };

  const handleClose = () => fetchRecommend();

  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="text-4xl mb-4 animate-pulse">💪</div>
        <div className="text-zinc-400 text-sm">メニューを取得中...</div>
      </div>
    );
  }

  if (screen === "training") {
    return (
      <TrainingView
        bodyPart={recommendation?.部位 ?? ""}
        exercises={exercises}
        setExercises={setExercises}
        condition={condition}
        setCondition={setCondition}
        onComplete={handleComplete}
      />
    );
  }

  if (screen === "history") {
    return <HistoryView onBack={() => setScreen("recommend")} />;
  }

  if (screen === "custom" && recommendation) {
    return (
      <CustomEditView
        recommendedBodyPart={recommendation.部位}
        selectedExercises={exercises}
        onStart={handleCustomStart}
        onBack={() => setScreen("recommend")}
      />
    );
  }

  if (screen === "review" && review) {
    return (
      <div className="h-screen overflow-hidden bg-black text-white flex flex-col">
        <div className="px-4 pt-safe-top pb-4 border-b border-zinc-800">
          <div className="mt-4 text-xs text-zinc-500">トレーニング完了</div>
          <div className="text-xl font-bold mt-1">{recommendation?.部位}</div>
        </div>

        <div className="flex-1 min-h-0 px-4 py-4 space-y-4 overflow-y-auto">
          <div className="bg-zinc-900 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-2">総合評価</div>
            <div className={`text-3xl font-bold flex items-center gap-2 ${RATING_COLOR[review.総合評価]}`}>
              <span>{RATING_EMOJI[review.総合評価]}</span>
              <span>{review.総合評価}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 bg-zinc-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${review.達成率}%` }} />
              </div>
              <div className="text-sm font-bold text-blue-400">{review.達成率}%</div>
            </div>
            <div className="text-xs text-zinc-500 mt-1">達成率</div>
          </div>

          <div className="bg-zinc-900 rounded-xl p-4 flex items-center gap-3">
            <div className={`text-2xl font-bold ${review.前回比 === "重量UP" ? "text-green-400" : review.前回比 === "重量DOWN" ? "text-red-400" : "text-zinc-400"}`}>
              {review.前回比 === "重量UP" ? "↑" : review.前回比 === "重量DOWN" ? "↓" : "→"}
            </div>
            <div>
              <div className="text-xs text-zinc-500">前回比</div>
              <div className="font-semibold">{review.前回比}</div>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-2">Claudeのレビュー</div>
            <div className="text-sm leading-relaxed">{review.レビュー本文}</div>
          </div>

          <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
            <div className="text-xs text-blue-400 mb-2">次回への指示</div>
            <div className="text-sm leading-relaxed">{review.次回への指示}</div>
          </div>
        </div>

        <div className="px-4 pt-3 pb-safe-bottom">
          <button onClick={handleClose} className="w-full py-4 rounded-xl text-base font-bold bg-zinc-800 active:bg-zinc-700">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  // recommend screen
  return (
    <div className="h-screen overflow-hidden bg-black text-white flex flex-col">
      <div className="px-4 pt-safe-top pb-2 flex-shrink-0 flex items-end justify-between">
        <div className="mt-4 text-xs text-zinc-500">今日のメニュー</div>
        <button
          onClick={() => setScreen("history")}
          className="text-xs text-zinc-500 bg-zinc-800 px-3 py-1.5 rounded-lg active:bg-zinc-700"
        >履歴</button>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <div className="text-red-400 text-sm text-center">{error}</div>
          <button onClick={fetchRecommend} className="px-6 py-3 bg-zinc-800 rounded-xl text-sm">再試行</button>
        </div>
      ) : recommendation && (
        <div className="flex-1 min-h-0 px-4 space-y-3 overflow-y-auto scrollbar-hide pb-36">
          <div className="bg-zinc-900 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{BODY_PART_EMOJI[recommendation.部位] ?? "💪"}</div>
              <div>
                <div className="text-xl font-bold">{recommendation.部位}</div>
                <div className="text-sm text-zinc-400 mt-0.5">{recommendation.理由}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500 mb-2">今日の種目（{recommendation.種目リスト.length}種目）</div>
            <div className="space-y-2">
              {recommendation.種目リスト.map((ex) => (
                <div key={ex.id} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="font-medium text-sm">{ex.種目名}</div>
                  <div className="text-xs text-zinc-500 ml-2 text-right flex-shrink-0">
                    {ex.目標重量kg > 0 ? `${ex.目標重量kg}kg × ` : "自重 × "}
                    {ex.目標レップ数}rep × {ex.セット数}set
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {recommendation && !error && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-safe-bottom space-y-2">
          <button onClick={handleStart} className="w-full py-4 rounded-xl text-base font-bold bg-blue-600 active:bg-blue-700">
            開始する
          </button>
          <button onClick={handleCustomEdit} className="w-full py-3 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700">
            カスタム編集
          </button>
        </div>
      )}
    </div>
  );
}
