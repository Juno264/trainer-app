import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import type { HistorySession, HistoryReview } from "../../lib/types";

export async function GET() {
  try {
    const [{ data: records, error: recErr }, { data: reviews, error: revErr }] = await Promise.all([
      supabase
        .from("training_records")
        .select("exercise_name, body_part, trained_at, set_num, weight_kg, reps, achieved, rpe")
        .order("trained_at", { ascending: false })
        .limit(1000),
      supabase
        .from("reviews")
        .select("body_part, trained_at, overall_rating, achievement_rate, weight_change, review_text, next_instruction, review_json")
        .order("trained_at", { ascending: false })
        .limit(20),
    ]);

    if (recErr) throw recErr;
    if (revErr) throw revErr;

    const reviewMap: Record<string, HistoryReview> = {};
    for (const r of reviews ?? []) {
      const rj = (r.review_json ?? {}) as Partial<HistoryReview>;
      reviewMap[`${r.trained_at}__${r.body_part}`] = {
        総合評価: r.overall_rating as HistoryReview["総合評価"],
        達成率: r.achievement_rate,
        前回比: r.weight_change as HistoryReview["前回比"],
        レビュー本文: r.review_text,
        次回への指示: r.next_instruction,
        良かった点: rj.良かった点,
        重点ポイント: rj.重点ポイント,
        次回アクション: rj.次回アクション,
        メモ反映: rj.メモ反映,
        長期トレンド: rj.長期トレンド,
      };
    }

    type RawSet = { set_num: number; weight_kg: number; reps: number; achieved: boolean };
    const sessions: Record<string, {
      部位: string;
      exercises: Record<string, { sets: RawSet[]; rpe: number }>;
    }> = {};

    for (const r of records ?? []) {
      const key = `${r.trained_at}__${r.body_part}`;
      if (!sessions[key]) sessions[key] = { 部位: r.body_part, exercises: {} };
      if (!sessions[key].exercises[r.exercise_name]) {
        sessions[key].exercises[r.exercise_name] = { sets: [], rpe: r.rpe };
      }
      sessions[key].exercises[r.exercise_name].sets.push({
        set_num: r.set_num, weight_kg: r.weight_kg, reps: r.reps, achieved: r.achieved,
      });
    }

    const result: HistorySession[] = Object.entries(sessions)
      .map(([key, session]) => ({
        date: key.split("__")[0],
        部位: session.部位,
        exercises: Object.entries(session.exercises).map(([name, ex]) => ({
          種目名: name,
          sets: ex.sets
            .sort((a, b) => a.set_num - b.set_num)
            .map((s) => ({ 重量kg: s.weight_kg, レップ数: s.reps, 達成: s.achieved })),
          rpe: ex.rpe,
        })),
        review: reviewMap[key] ?? null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    return NextResponse.json(result);
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "履歴の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
