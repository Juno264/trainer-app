import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import { estimate1RM, DEFAULT_BODY_WEIGHT } from "../../lib/load";
import type { LoadType } from "../../lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exercise = searchParams.get("exercise");

  try {
    if (!exercise) {
      return NextResponse.json({ error: "exercise パラメータが必要です" }, { status: 400 });
    }

    // 自重種目の実効負荷（体重±重量）を出すために、負荷タイプと体重が要る
    const [{ data, error }, { data: exRow }, { data: setting }] = await Promise.all([
      supabase
        .from("training_records")
        .select("trained_at, weight_kg, reps, set_num")
        .eq("exercise_name", exercise)
        .order("trained_at", { ascending: true })
        .order("set_num", { ascending: true }),
      supabase
        .from("exercises")
        .select("load_type")
        .eq("name", exercise)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "body_weight_kg")
        .maybeSingle(),
    ]);

    if (error) throw error;

    const loadType = (exRow?.load_type ?? "external") as LoadType;
    const parsedBw = Number(setting?.value);
    const bodyWeight = Number.isFinite(parsedBw) && parsedBw > 0 ? parsedBw : DEFAULT_BODY_WEIGHT;

    // 日付ごとに集約：重量/レップは set_num=1（最初に出現する行）、e1RM は全セットの最大
    const byDate = new Map<string, { weight_kg: number; reps: number; e1rm: number }>();
    for (const r of data ?? []) {
      const e1rm = estimate1RM(r.weight_kg, r.reps, loadType, bodyWeight);
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
      e1rm: v.e1rm,
    }));

    return NextResponse.json({ exercise, loadType, bodyWeight, data: points });
  } catch (error) {
    return NextResponse.json({ error: "統計の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
