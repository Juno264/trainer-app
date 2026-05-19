"use client";
import { useState, useEffect } from "react";
import type { ExercisePlan, ExerciseState, RecommendData, BodyPartInfo, Condition, ReviewResult } from "./lib/types";
import TrainingView from "./components/TrainingView";
import CustomEditView from "./components/CustomEditView";
import HistoryView from "./components/HistoryView";
import ExerciseManageView from "./components/ExerciseManageView";

type Screen = "loading" | "recommend" | "custom" | "training" | "review" | "history" | "manage";

function makeState(plan: ExercisePlan): ExerciseState {
  return {
    plan,
    sets: Array.from({ length: plan.セット数 }, () => ({ 重量kg: "", レップ数: "" })),
    rpe: 7,
    memo: "",
    expanded: false,
  };
}

const BODY_PART_EMOJI: Record<string, string> = {
  "胸・肩・三頭": "💪",
  "背中・二頭": "🦾",
  "脚・お尻": "🦵",
  "有酸素（プール）": "🏊",
};

const STATUS_COLOR: Record<string, string> = {
  久しぶり: "text-orange-400",
  そろそろ: "text-yellow-400",
  回復済み: "text-green-400",
  疲労中: "text-zinc-500",
  未実施: "text-zinc-400",
};

const STATUS_BAR: Record<string, string> = {
  久しぶり: "bg-orange-500",
  そろそろ: "bg-yellow-500",
  回復済み: "bg-green-500",
  疲労中: "bg-zinc-600",
  未実施: "bg-blue-500",
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
  const [bodyPartList, setBodyPartList] = useState<BodyPartInfo[]>([]);
  const [allExercisesByPart, setAllExercisesByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>("");
  const [exercises, setExercises] = useState<ExerciseState[]>([]);
  const [condition, setCondition] = useState<Condition>("普通");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setScreen("loading");
    setError(null);
    try {
      const [recRes, exRes] = await Promise.all([
        fetch("/api/recommend"),
        fetch("/api/exercises"),
      ]);
      if (!recRes.ok) {
        const d = await recRes.json();
        throw new Error(d.detail || d.error || "エラー");
      }
      const recData: RecommendData = await recRes.json();
      const exData: Record<string, ExercisePlan[]> = exRes.ok ? await exRes.json() : {};

      setBodyPartList(recData.部位リスト);
      setAllExercisesByPart(exData);

      const recommended = recData.部位リスト.find((bp) => bp.おすすめ) ?? recData.部位リスト[0];
      if (recommended) {
        setSelectedBodyPart(recommended.名前);
        setExercises((exData[recommended.名前] ?? []).map(makeState));
      }
      setScreen("recommend");
    } catch (e) {
      setError(String(e));
      setScreen("recommend");
    }
  };

  const handleSelectBodyPart = (part: string) => {
    setSelectedBodyPart(part);
    setExercises((allExercisesByPart[part] ?? []).map(makeState));
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

  const handleClose = () => fetchData();

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
        bodyPart={selectedBodyPart}
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

  if (screen === "manage") {
    return <ExerciseManageView onBack={() => fetchData()} />;
  }

  if (screen === "custom") {
    return (
      <CustomEditView
        recommendedBodyPart={selectedBodyPart}
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
          <div className="text-xl font-bold mt-1">{selectedBodyPart}</div>
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

  // 久しぶりバナーを表示する条件（2部位以上が久しぶり or 未実施）
  const jisaburiCount = bodyPartList.filter((bp) => bp.状態 === "久しぶり" || bp.状態 === "未実施").length;
  const selectedInfo = bodyPartList.find((bp) => bp.名前 === selectedBodyPart);

  // recommend screen
  return (
    <div className="h-screen overflow-hidden bg-black text-white flex flex-col">
      {/* ヘッダー */}
      <div className="flex-shrink-0 relative z-10 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="text-xs text-zinc-500">今日はどこを鍛える？</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setScreen("manage")}
              className="text-xs text-zinc-500 bg-zinc-800 px-3 py-1.5 rounded-lg active:bg-zinc-700"
            >管理</button>
            <button
              onClick={() => setScreen("history")}
              className="text-xs text-zinc-500 bg-zinc-800 px-3 py-1.5 rounded-lg active:bg-zinc-700"
            >履歴</button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <div className="text-red-400 text-sm text-center">{error}</div>
          <button onClick={fetchData} className="px-6 py-3 bg-zinc-800 rounded-xl text-sm">再試行</button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">

          {/* 久しぶりバナー */}
          {jisaburiCount >= 2 && (
            <div className="mx-4 mt-3 bg-amber-950/40 border border-amber-700/40 rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-amber-400 mb-0.5">久しぶりのトレーニング</div>
              <div className="text-xs text-amber-200/80">
                どれを選んでも大きな刺激になります。最初の1セットで感触を確認してから重量を決めましょう。
              </div>
            </div>
          )}

          {/* 部位カードリスト */}
          <div className="px-4 mt-3 space-y-2">
            {bodyPartList.map((bp) => {
              const isSelected = selectedBodyPart === bp.名前;
              const barWidth = Math.min(100, bp.回復進捗 * 100);

              const statusText =
                bp.状態 === "未実施" ? "記録なし" :
                bp.状態 === "疲労中" ? `回復中（${bp.回復目安日数}日で回復）` :
                bp.状態 === "回復済み" ? `${bp.経過日数}日前` :
                bp.状態 === "そろそろ" ? `${bp.経過日数}日前（そろそろ）` :
                `${bp.経過日数}日ぶり`;

              return (
                <button
                  key={bp.名前}
                  onClick={() => handleSelectBodyPart(bp.名前)}
                  className={`w-full px-4 py-3.5 rounded-xl text-left flex items-center gap-3 transition-colors border ${
                    isSelected
                      ? "bg-blue-950/50 border-blue-700/60"
                      : "bg-zinc-900 border-transparent active:bg-zinc-800"
                  }`}
                >
                  <div className="text-2xl">{BODY_PART_EMOJI[bp.名前] ?? "💪"}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{bp.名前}</span>
                      {bp.おすすめ && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full leading-none">おすすめ</span>
                      )}
                      {bp.状態 === "そろそろ" && (
                        <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded-full leading-none">そろそろ</span>
                      )}
                      {bp.状態 === "久しぶり" && (
                        <span className="text-xs bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded-full leading-none">久しぶり</span>
                      )}
                    </div>
                    <div className={`text-xs mt-1 ${STATUS_COLOR[bp.状態]}`}>{statusText}</div>
                    {/* 回復バー */}
                    <div className="mt-1.5 w-24 bg-zinc-800 rounded-full h-1">
                      <div
                        className={`h-1 rounded-full transition-all ${STATUS_BAR[bp.状態]}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  <div className={`text-lg ${isSelected ? "text-blue-400" : "text-zinc-600"}`}>›</div>
                </button>
              );
            })}
          </div>

          {/* 選択中部位の詳細 */}
          {selectedBodyPart && selectedInfo && (
            <div className="px-4 mt-4">
              {selectedInfo.状態 === "そろそろ" && (
                <div className="mb-3 bg-yellow-950/30 border border-yellow-800/40 rounded-xl px-4 py-2.5 text-xs text-yellow-300">
                  {selectedInfo.経過日数}日前のトレーニングです。いいタイミングです。
                </div>
              )}
              {selectedInfo.状態 === "久しぶり" && (
                <div className="mb-3 bg-orange-950/30 border border-orange-800/40 rounded-xl px-4 py-2.5 text-xs text-orange-300">
                  {selectedInfo.経過日数}日ぶりです。最初のセットは軽めで感触を確認してから重量を決めましょう。
                </div>
              )}

              <div className="text-xs text-zinc-500 mb-2">
                今日の種目（{exercises.length}種目）
              </div>
              <div className="space-y-2">
                {exercises.map((ex) => (
                  <div key={ex.plan.id} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="font-medium text-sm">{ex.plan.種目名}</div>
                    <div className="text-xs text-zinc-500 ml-2 text-right flex-shrink-0">
                      {ex.plan.目標重量kg > 0 ? `${ex.plan.目標重量kg}kg × ` : "自重 × "}
                      {ex.plan.目標レップ数}rep × {ex.plan.セット数}set
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* フッター */}
      {!error && selectedBodyPart && (
        <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-safe-bottom space-y-2">
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
