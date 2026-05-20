import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exercise = searchParams.get("exercise");

  try {
    if (!exercise) {
      return NextResponse.json({ error: "exercise パラメータが必要です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("training_records")
      .select("trained_at, weight_kg, reps, set_num")
      .eq("exercise_name", exercise)
      .order("trained_at", { ascending: true })
      .order("set_num", { ascending: true });

    if (error) throw error;

    // 日付ごとに集約：重量/レップは set_num=1（最初に出現する行）、e1RM は全セットの最大
    const byDate = new Map<string, { weight_kg: number; reps: number; e1rm: number }>();
    for (const r of data ?? []) {
      const e1rm = r.weight_kg > 0 ? r.weight_kg * (1 + r.reps / 30) : 0;
      const cur = byDate.get(r.trained_at);
      if (!cur) {
        byDate.set(r.trained_at, { weight_kg: r.weight_kg, reps: r.reps, e1rm });
      } else if (e1rm > cur.e1rm) {
        cur.e1rm = e1rm;
      }
    }

    const points = [...byDate.entries()].map(([date, v]) => ({
      date,
      weight_kg: v.weight_kg,
      reps: v.reps,
      e1rm: Math.round(v.e1rm * 10) / 10,
    }));

    return NextResponse.json({ exercise, data: points });
  } catch (error) {
    return NextResponse.json({ error: "統計の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
