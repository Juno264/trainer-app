"use client";
import { useState, useEffect } from "react";
import type { HistorySession } from "../lib/types";

type Props = {
  onBack: () => void;
};

const RATING_COLOR: Record<string, string> = {
  好調: "text-green-400",
  普通: "text-yellow-400",
  要注意: "text-red-400",
};

const RATING_BG: Record<string, string> = {
  好調: "bg-green-900/40 border-green-700/50",
  普通: "bg-yellow-900/40 border-yellow-700/50",
  要注意: "bg-red-900/40 border-red-700/50",
};

const CHANGE_ICON: Record<string, string> = {
  重量UP: "↑",
  維持: "→",
  重量DOWN: "↓",
};

const CHANGE_COLOR: Record<string, string> = {
  重量UP: "text-green-400",
  維持: "text-zinc-400",
  重量DOWN: "text-red-400",
};

export default function HistoryView({ onBack }: Props) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSessions(data);
        else setError(data.error ?? "エラー");
      })
      .catch(() => setError("履歴の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (date: string) => {
    const d = new Date(date);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
      {/* ヘッダー */}
      <div className="flex-shrink-0 relative z-10 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="flex items-center gap-3 mt-2">
          <button onClick={onBack} className="text-zinc-400 text-lg">←</button>
          <div>
            <div className="text-xs text-zinc-500">過去の記録</div>
            <div className="text-lg font-bold">トレーニング履歴</div>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-zinc-500 text-sm animate-pulse">読み込み中...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32">
            <div className="text-red-400 text-sm text-center">{error}</div>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <div className="text-zinc-500 text-sm">まだ記録がありません</div>
          </div>
        )}

        {sessions.map((session, idx) => {
          const isOpen = expandedIdx === idx;
          return (
            <div key={`${session.date}-${session.部位}`} className="bg-zinc-900 rounded-xl overflow-hidden">
              {/* セッションヘッダー */}
              <button
                onClick={() => setExpandedIdx(isOpen ? null : idx)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div>
                  <div className="text-xs text-zinc-500">{fmt(session.date)}</div>
                  <div className="font-semibold mt-0.5">{session.部位}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {session.exercises.length}種目
                    {session.review && (
                      <span className={`ml-2 ${RATING_COLOR[session.review.総合評価]}`}>
                        {session.review.総合評価} {session.review.達成率}%
                      </span>
                    )}
                    {session.review && (
                      <span className={`ml-1 ${CHANGE_COLOR[session.review.前回比]}`}>
                        {CHANGE_ICON[session.review.前回比]}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-zinc-500 text-lg">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {/* 種目一覧 */}
                  {session.exercises.map((ex) => (
                    <div key={ex.種目名} className="space-y-1.5">
                      <div className="text-sm font-medium text-zinc-300">{ex.種目名}</div>
                      <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-xs text-zinc-500 px-1">
                        <div>Set</div>
                        <div>重量(kg)</div>
                        <div>回数</div>
                      </div>
                      {ex.sets.map((set, si) => (
                        <div
                          key={si}
                          className={`grid grid-cols-[2rem_1fr_1fr] gap-2 items-center rounded-lg px-2 py-1.5 text-sm ${set.達成 ? "bg-green-950/40 border border-green-800/50" : "bg-zinc-800/40"}`}
                        >
                          <div className="text-zinc-500">{si + 1}</div>
                          <div>{set.重量kg > 0 ? `${set.重量kg}kg` : "自重"}</div>
                          <div>{set.レップ数}rep</div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Claudeレビュー */}
                  {session.review && (
                    <div className={`rounded-xl p-3 border ${RATING_BG[session.review.総合評価]}`}>
                      <div className="text-xs text-zinc-400 mb-1.5">Claudeのレビュー</div>
                      <div className="text-xs leading-relaxed text-zinc-300">{session.review.レビュー本文}</div>
                      {session.review.次回への指示 && (
                        <div className="mt-2 text-xs text-blue-400/80 leading-relaxed">{session.review.次回への指示}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
