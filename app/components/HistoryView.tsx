"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { HistorySession, ExercisePlan, StatsPoint, WeeklySummary } from "../lib/types";

const StatsChart = dynamic(() => import("./StatsChart"), { ssr: false });


type Tab = "記録" | "グラフ" | "カレンダー";

const RATING_COLOR: Record<string, string> = {
  好調: "text-green-400", 普通: "text-yellow-400", 要注意: "text-red-400",
};
const RATING_BG: Record<string, string> = {
  好調: "bg-green-900/40 border-green-700/50",
  普通: "bg-yellow-900/40 border-yellow-700/50",
  要注意: "bg-red-900/40 border-red-700/50",
};
const CHANGE_ICON: Record<string, string> = { 重量UP: "↑", 維持: "→", 重量DOWN: "↓" };
const CHANGE_COLOR: Record<string, string> = {
  重量UP: "text-green-400", 維持: "text-zinc-400", 重量DOWN: "text-red-400",
};
const PART_DOT_COLOR: Record<string, string> = {
  "胸・肩・三頭": "bg-blue-500",
  "背中・二頭": "bg-green-500",
  "脚・お尻": "bg-purple-500",
  "有酸素（プール）": "bg-cyan-500",
};
const BODY_PARTS = ["胸・肩・三頭", "背中・二頭", "脚・お尻"];

const fmt = (date: string) => {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

// ─── カレンダーコンポーネント ───────────────────────────────────────────
function CalendarView({ calendarData }: { calendarData: Record<string, string[]> }) {
  const [current, setCurrent] = useState(() => new Date());
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  // 日曜始まり
  const cells: (number | null)[] = Array.from({ length: firstDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrent((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="p-2 text-zinc-400 text-lg active:text-white"
        >←</button>
        <div className="text-sm font-semibold">{year}年{month + 1}月</div>
        <button
          onClick={() => setCurrent((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="p-2 text-zinc-400 text-lg active:text-white"
        >→</button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
          <div key={d} className="text-center text-xs text-zinc-600 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const parts = calendarData[dateStr] ?? [];
          const isToday = dateStr === today;
          return (
            <div key={dateStr} className={`flex flex-col items-center py-1 rounded-lg ${isToday ? "bg-zinc-800" : ""}`}>
              <span className={`text-xs leading-none ${isToday ? "text-white font-bold" : "text-zinc-400"}`}>{day}</span>
              <div className="flex gap-0.5 mt-1 h-2 items-center">
                {parts.map((p) => (
                  <div key={p} className={`w-1.5 h-1.5 rounded-full ${PART_DOT_COLOR[p] ?? "bg-zinc-500"}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
        {Object.entries(PART_DOT_COLOR).map(([part, color]) => (
          <div key={part} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-xs text-zinc-500">{part}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────
export default function HistoryView() {
  const [tab, setTab] = useState<Tab>("記録");

  // 記録タブ
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // グラフタブ
  const [byPart, setByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [selectedPart, setSelectedPart] = useState(BODY_PARTS[0]);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [statsData, setStatsData] = useState<StatsPoint[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // カレンダータブ
  const [calendarData, setCalendarData] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setSessions(data) : setSessionError(data.error ?? "エラー"))
      .catch(() => setSessionError("履歴の取得に失敗しました"))
      .finally(() => setLoadingSessions(false));

    fetch("/api/exercises")
      .then((r) => r.json())
      .then((data) => { if (!data.error) setByPart(data); });

    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => { if (!data.error) setCalendarData(data); });
  }, []);

  const fetchWeeklySummary = () => {
    setLoadingSummary(true);
    fetch("/api/weekly-summary")
      .then((r) => r.json())
      .then((data) => { if (!data.error) setWeeklySummary(data); })
      .finally(() => setLoadingSummary(false));
  };

  const fetchStats = (exercise: string) => {
    if (!exercise) return;
    setLoadingStats(true);
    fetch(`/api/stats?exercise=${encodeURIComponent(exercise)}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setStatsData(data.data ?? []); })
      .finally(() => setLoadingStats(false));
  };

  const exercises = byPart[selectedPart] ?? [];
  const selectedPlanForGraph = exercises.find((e) => e.種目名 === selectedExercise);
  const isBodyweight = selectedPlanForGraph ? selectedPlanForGraph.目標重量kg === 0 : false;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black text-white">
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-0">
        <div className="flex items-center gap-3 mt-2 pb-0">
          <div className="pb-3">
            <div className="text-xs text-zinc-500">過去の記録</div>
            <div className="text-lg font-bold">トレーニング履歴</div>
          </div>
        </div>
        {/* タブ */}
        <div className="flex">
          {(["記録", "グラフ", "カレンダー"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? "text-white border-b-2 border-blue-500" : "text-zinc-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide">

        {/* ─── 記録タブ ─── */}
        {tab === "記録" && (
          <div className="px-4 pt-3 pb-8 space-y-3">
            {/* 週次サマリーカード */}
            <div className="bg-zinc-900 rounded-xl overflow-hidden">
              <button
                onClick={weeklySummary ? undefined : fetchWeeklySummary}
                disabled={loadingSummary}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div>
                  <div className="text-xs text-zinc-500">Claude AI</div>
                  <div className="text-sm font-semibold">今週のサマリー</div>
                </div>
                {!weeklySummary && (
                  <span className={`text-xs px-3 py-1.5 rounded-lg ${loadingSummary ? "bg-zinc-700 text-zinc-400" : "bg-blue-600 text-white"}`}>
                    {loadingSummary ? "生成中..." : "生成する"}
                  </span>
                )}
                {weeklySummary && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setWeeklySummary(null); }}
                    className="text-xs text-zinc-500"
                  >
                    ✕
                  </button>
                )}
              </button>
              {weeklySummary && (
                <div className="px-4 pb-4">
                  <div className="text-xs text-zinc-500 mb-2">
                    {weeklySummary.period.from.slice(5).replace("-", "/")} 〜 {weeklySummary.period.to.slice(5).replace("-", "/")}
                    {" "}／ {weeklySummary.sessionCount}回
                  </div>
                  <div className="text-sm leading-relaxed text-zinc-200">{weeklySummary.summary}</div>
                </div>
              )}
            </div>

            {/* セッション一覧 */}
            {loadingSessions && (
              <div className="flex items-center justify-center h-32">
                <div className="text-zinc-500 text-sm animate-pulse">読み込み中...</div>
              </div>
            )}
            {sessionError && (
              <div className="text-red-400 text-sm text-center py-8">{sessionError}</div>
            )}
            {!loadingSessions && !sessionError && sessions.length === 0 && (
              <div className="text-zinc-500 text-sm text-center py-8">まだ記録がありません</div>
            )}
            {sessions.map((session, idx) => {
              const isOpen = expandedIdx === idx;
              return (
                <div key={`${session.date}-${session.部位}`} className="bg-zinc-900 rounded-xl overflow-hidden">
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
                      {session.exercises.map((ex) => (
                        <div key={ex.種目名} className="space-y-1.5">
                          <div className="text-sm font-medium text-zinc-300">{ex.種目名}</div>
                          <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-xs text-zinc-500 px-1">
                            <div>Set</div><div>重量(kg)</div><div>回数</div>
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
        )}

        {/* ─── グラフタブ ─── */}
        {tab === "グラフ" && (
          <div className="px-4 pt-4 pb-8 space-y-4">
            {/* 部位選択 */}
            <div className="flex gap-2">
              {BODY_PARTS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSelectedPart(p);
                    setSelectedExercise("");
                    setStatsData([]);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                    selectedPart === p ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* 種目選択 */}
            <div className="space-y-1.5">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    setSelectedExercise(ex.種目名);
                    fetchStats(ex.種目名);
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl text-sm text-left transition-colors ${
                    selectedExercise === ex.種目名
                      ? "bg-blue-950/50 border border-blue-700/60 text-white"
                      : "bg-zinc-900 text-zinc-300 active:bg-zinc-800"
                  }`}
                >
                  {ex.種目名}
                  <span className="text-xs text-zinc-500 ml-2">
                    {ex.目標重量kg > 0 ? `目標 ${ex.目標重量kg}kg` : "自重"}
                  </span>
                </button>
              ))}
            </div>

            {/* グラフ */}
            {selectedExercise && (
              <div className="bg-zinc-900 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-1">{selectedExercise}</div>
                <div className="text-sm font-semibold mb-4">
                  {isBodyweight ? "レップ数推移" : "重量推移"}
                </div>
                {loadingStats ? (
                  <div className="flex items-center justify-center h-48 text-zinc-500 text-sm animate-pulse">
                    読み込み中...
                  </div>
                ) : (
                  <StatsChart data={statsData} isBodyweight={isBodyweight} />
                )}
              </div>
            )}

            {!selectedExercise && (
              <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
                種目を選択してください
              </div>
            )}
          </div>
        )}

        {/* ─── カレンダータブ ─── */}
        {tab === "カレンダー" && (
          <div className="px-4 pt-4 pb-8">
            <CalendarView calendarData={calendarData} />
          </div>
        )}
      </div>
    </div>
  );
}
