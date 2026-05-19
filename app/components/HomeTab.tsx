"use client";
import type { BodyPartInfo } from "../lib/types";

type Props = {
  bodyPartList: BodyPartInfo[];
  selectedBodyPart: string;
  error: string | null;
  onRetry: () => void;
  onStartTraining: () => void;
  onGoToTrain: () => void;
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

export default function HomeTab({ bodyPartList, selectedBodyPart, error, onRetry, onStartTraining, onGoToTrain }: Props) {
  const recommended = bodyPartList.find((bp) => bp.おすすめ) ?? bodyPartList[0];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="mt-2">
          <div className="text-xs text-zinc-500">コンディション確認</div>
          <div className="text-lg font-bold">ホーム</div>
        </div>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <div className="text-red-400 text-sm text-center">{error}</div>
          <button onClick={onRetry} className="px-6 py-3 bg-zinc-800 rounded-xl text-sm">再試行</button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide px-4 py-4 space-y-4">
          {/* おすすめカード */}
          {recommended && (
            <div className="bg-blue-950/40 border border-blue-700/40 rounded-2xl p-4">
              <div className="text-xs text-blue-400 font-medium mb-3">今日のおすすめ</div>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl">{BODY_PART_EMOJI[recommended.名前] ?? "💪"}</div>
                <div>
                  <div className="font-bold text-base">{recommended.名前}</div>
                  <div className={`text-xs mt-0.5 ${STATUS_COLOR[recommended.状態]}`}>
                    {recommended.状態 === "未実施" ? "まだ記録なし" :
                     recommended.状態 === "疲労中" ? `回復中（${recommended.回復目安日数}日で回復）` :
                     recommended.状態 === "回復済み" ? `${recommended.経過日数}日前` :
                     recommended.状態 === "そろそろ" ? `${recommended.経過日数}日前（そろそろ）` :
                     `${recommended.経過日数}日ぶり`}
                  </div>
                </div>
              </div>
              <button
                onClick={onStartTraining}
                className="w-full py-3.5 rounded-xl text-sm font-bold bg-blue-600 active:bg-blue-700"
              >
                今すぐ開始
              </button>
            </div>
          )}

          {/* 全部位の回復状況 */}
          <div>
            <div className="text-xs text-zinc-500 mb-2">全部位の回復状況</div>
            <div className="space-y-2">
              {bodyPartList.map((bp) => {
                const barWidth = Math.min(100, bp.回復進捗 * 100);
                const statusText =
                  bp.状態 === "未実施" ? "記録なし" :
                  bp.状態 === "疲労中" ? `回復中（${bp.回復目安日数}日）` :
                  bp.状態 === "回復済み" ? `${bp.経過日数}日前` :
                  bp.状態 === "そろそろ" ? `${bp.経過日数}日前` :
                  `${bp.経過日数}日ぶり`;

                return (
                  <div key={bp.名前} className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="text-xl">{BODY_PART_EMOJI[bp.名前] ?? "💪"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{bp.名前}</span>
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
                      <div className={`text-xs mt-0.5 ${STATUS_COLOR[bp.状態]}`}>{statusText}</div>
                      <div className="mt-1.5 w-20 bg-zinc-800 rounded-full h-1">
                        <div className={`h-1 rounded-full ${STATUS_BAR[bp.状態]}`} style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={onGoToTrain}
            className="w-full py-3 rounded-xl text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 active:bg-zinc-800"
          >
            別の部位でトレーニングする →
          </button>
        </div>
      )}
    </div>
  );
}
