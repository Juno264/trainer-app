"use client";
import type { BodyPartInfo, ExercisePlan, ExerciseState } from "../lib/types";

type Props = {
  bodyPartList: BodyPartInfo[];
  allExercisesByPart: Record<string, ExercisePlan[]>;
  selectedBodyPart: string;
  exercises: ExerciseState[];
  error: string | null;
  onRetry: () => void;
  onSelectBodyPart: (part: string) => void;
  onStartTraining: () => void;
  onCustomEdit: () => void;
};

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

export default function TrainTab({
  bodyPartList, allExercisesByPart, selectedBodyPart, exercises,
  error, onRetry, onSelectBodyPart, onStartTraining, onCustomEdit,
}: Props) {
  const jisaburiCount = bodyPartList.filter((bp) => bp.状態 === "久しぶり" || bp.状態 === "未実施").length;
  const selectedInfo = bodyPartList.find((bp) => bp.名前 === selectedBodyPart);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="mt-2">
          <div className="text-xs text-zinc-500">今日はどこを鍛える？</div>
          <div className="text-lg font-bold">トレーニング</div>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <div className="text-red-400 text-sm text-center">{error}</div>
          <button onClick={onRetry} className="px-6 py-3 bg-zinc-800 rounded-xl text-sm">再試行</button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide">
          {jisaburiCount >= 2 && (
            <div className="mx-4 mt-3 bg-amber-950/40 border border-amber-700/40 rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-amber-400 mb-0.5">久しぶりのトレーニング</div>
              <div className="text-xs text-amber-200/80">最初の1セットで感触を確認してから重量を決めましょう。</div>
            </div>
          )}

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
                  onClick={() => onSelectBodyPart(bp.名前)}
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

          {selectedBodyPart && selectedInfo && (
            <div className="px-4 mt-4 pb-4">
              {selectedInfo.状態 === "そろそろ" && (
                <div className="mb-3 bg-yellow-950/30 border border-yellow-800/40 rounded-xl px-4 py-2.5 text-xs text-yellow-300">
                  {selectedInfo.経過日数}日前のトレーニングです。いいタイミングです。
                </div>
              )}
              {selectedInfo.状態 === "久しぶり" && (
                <div className="mb-3 bg-orange-950/30 border border-orange-800/40 rounded-xl px-4 py-2.5 text-xs text-orange-300">
                  {selectedInfo.経過日数}日ぶりです。最初のセットは軽めで感触を確認しましょう。
                </div>
              )}
              <div className="text-xs text-zinc-500 mb-2">今日の種目（{exercises.length}種目）</div>
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

      {!error && selectedBodyPart && (
        <div className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-3 space-y-2">
          <button
            onClick={onStartTraining}
            className="w-full py-4 rounded-xl text-base font-bold bg-blue-600 active:bg-blue-700"
          >
            開始する
          </button>
          <button
            onClick={onCustomEdit}
            className="w-full py-3 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 active:bg-zinc-700"
          >
            カスタム編集
          </button>
        </div>
      )}
    </div>
  );
}
