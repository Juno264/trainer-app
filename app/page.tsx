"use client";
import { useState, useEffect } from "react";
import type { ExercisePlan, ExerciseState, RecommendData, BodyPartInfo, Condition, ReviewResult } from "./lib/types";
import TrainingView from "./components/TrainingView";
import CustomEditView from "./components/CustomEditView";
import HistoryView from "./components/HistoryView";
import ExerciseManageView from "./components/ExerciseManageView";
import BottomTabBar, { type AppTab } from "./components/BottomTabBar";
import HomeTab from "./components/HomeTab";
import TrainTab from "./components/TrainTab";
import { makeExerciseState as makeState, activeExercises } from "./lib/session";

type Overlay = "custom" | "training" | "review" | null;

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
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);

  const [loading, setLoading] = useState(true);
  const [bodyPartList, setBodyPartList] = useState<BodyPartInfo[]>([]);
  const [allExercisesByPart, setAllExercisesByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>("");
  const [exercises, setExercises] = useState<ExerciseState[]>([]);
  const [condition, setCondition] = useState<Condition>("普通");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
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
        // 保留中(hold)の種目はトレーニング対象に含めない
        setExercises(activeExercises(exData[recommended.名前] ?? []).map(makeState));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBodyPart = (part: string) => {
    setSelectedBodyPart(part);
    setExercises(activeExercises(allExercisesByPart[part] ?? []).map(makeState));
  };

  const handleCustomStart = (selected: ExerciseState[]) => {
    setExercises(selected);
    setOverlay("training");
  };

  const handleComplete = (r: ReviewResult) => {
    setReview(r);
    setOverlay("review");
  };

  const handleCloseReview = () => {
    setReview(null);
    setOverlay(null);
    setActiveTab("home");
    fetchData();
  };

  // ── 全画面オーバーレイ ────────────────────────────────────────────────────
  if (overlay === "training") {
    return (
      <TrainingView
        bodyPart={selectedBodyPart}
        exercises={exercises}
        setExercises={setExercises}
        condition={condition}
        setCondition={setCondition}
        onComplete={handleComplete}
        onCancel={() => { setOverlay(null); setActiveTab("home"); fetchData(); }}
        onPause={() => { setOverlay(null); setActiveTab("train"); }}
      />
    );
  }

  if (overlay === "custom") {
    return (
      <CustomEditView
        recommendedBodyPart={selectedBodyPart}
        selectedExercises={exercises}
        onStart={handleCustomStart}
        onBack={() => setOverlay(null)}
      />
    );
  }

  if (overlay === "review" && review) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col">
        <div className="px-4 pt-safe-top pb-4 border-b border-zinc-800">
          <div className="mt-4 text-xs text-zinc-500">トレーニング完了</div>
          <div className="text-xl font-bold mt-1">{selectedBodyPart}</div>
        </div>

        <div className="flex-1 min-h-0 px-4 py-4 space-y-4 overflow-y-scroll scrollbar-hide">
          <div className="bg-zinc-900 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-2">総合評価</div>
            <div className={`text-3xl font-bold flex items-center gap-2 ${RATING_COLOR[review.総合評価]}`}>
              <span>{RATING_EMOJI[review.総合評価]}</span>
              <span>{review.総合評価}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 bg-zinc-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, review.達成率)}%` }} />
              </div>
              <div className="text-sm font-bold text-blue-400">{review.達成率}%</div>
            </div>
            {review.achievement ? (
              <div className="text-xs text-zinc-500 mt-1.5">
                必須 {review.achievement.core_done}/{review.achievement.core_planned} セット
                {review.achievement.bonus_done > 0 && (
                  <span className="text-zinc-400"> ・ ボーナス +{review.achievement.bonus_done}</span>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 mt-1">達成率</div>
            )}
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

          {/* トレーナーのひとこと */}
          <div className="bg-zinc-900 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-2">トレーナーより</div>
            <div className="text-sm leading-relaxed">{review.レビュー本文}</div>
          </div>

          {/* 良かった点 */}
          {review.良かった点 && review.良かった点.length > 0 && (
            <div className="bg-green-950/30 border border-green-800/40 rounded-xl p-4">
              <div className="text-xs text-green-400 mb-2 font-medium">✅ できていたこと</div>
              <ul className="space-y-1.5">
                {review.良かった点.map((p, i) => (
                  <li key={i} className="text-sm leading-relaxed flex gap-2">
                    <span className="text-green-400 flex-shrink-0">・</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* メモ反映 */}
          {review.メモ反映 && review.メモ反映.trim() && (
            <div className="bg-zinc-900 rounded-xl p-4">
              <div className="text-xs text-zinc-500 mb-2">📝 メモから読み取ったこと</div>
              <div className="text-sm leading-relaxed text-zinc-300">{review.メモ反映}</div>
            </div>
          )}

          {/* 重点ポイント + 次回アクション */}
          {(review.重点ポイント || (review.次回アクション && review.次回アクション.length > 0)) && (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
              {review.重点ポイント && (
                <>
                  <div className="text-xs text-blue-400 mb-1 font-medium">🎯 次回の重点</div>
                  <div className="text-sm font-semibold mb-3">{review.重点ポイント}</div>
                </>
              )}
              {review.次回アクション && review.次回アクション.length > 0 && (
                <div className="space-y-2.5">
                  {review.次回アクション.map((a, i) => (
                    <div key={i} className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</div>
                      <div>
                        <div className="text-sm font-medium">{a.アクション}</div>
                        {a.理由 && <div className="text-xs text-blue-200/70 mt-0.5">{a.理由}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 長期トレンド */}
          {review.長期トレンド && review.長期トレンド.trim() && (
            <div className="bg-zinc-900 rounded-xl p-4">
              <div className="text-xs text-zinc-500 mb-2">📈 4週間のトレンド</div>
              <div className="text-sm leading-relaxed text-zinc-300">{review.長期トレンド}</div>
            </div>
          )}

          {/* フォールバック: 構造化レビューが無い場合は従来の次回指示を表示 */}
          {!review.重点ポイント && review.次回への指示 && (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
              <div className="text-xs text-blue-400 mb-2">次回への指示</div>
              <div className="text-sm leading-relaxed">{review.次回への指示}</div>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-safe-bottom">
          <button onClick={handleCloseReview} className="w-full py-4 rounded-xl text-base font-bold bg-zinc-800 active:bg-zinc-700">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  // ── ローディング ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <div className="text-4xl mb-4 animate-pulse">💪</div>
        <div className="text-zinc-400 text-sm">メニューを取得中...</div>
      </div>
    );
  }

  // ── タブレイアウト ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "home" && (
          <HomeTab
            bodyPartList={bodyPartList}
            selectedBodyPart={selectedBodyPart}
            error={error}
            onRetry={fetchData}
            onStartTraining={() => setOverlay("training")}
            onGoToTrain={() => setActiveTab("train")}
          />
        )}
        {activeTab === "train" && (
          <TrainTab
            bodyPartList={bodyPartList}
            allExercisesByPart={allExercisesByPart}
            selectedBodyPart={selectedBodyPart}
            exercises={exercises}
            error={error}
            onRetry={fetchData}
            onSelectBodyPart={handleSelectBodyPart}
            onStartTraining={() => setOverlay("training")}
            onCustomEdit={() => setOverlay("custom")}
          />
        )}
        {activeTab === "history" && <HistoryView />}
        {activeTab === "manage" && <ExerciseManageView />}
      </div>

      <BottomTabBar activeTab={activeTab} onSelect={setActiveTab} />
    </div>
  );
}
