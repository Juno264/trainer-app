import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import type { ExercisePlan } from "../../lib/types";

export async function GET() {
  try {
    const [{ data: exList, error: exErr }, { data: records, error: recErr }] = await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, body_part, target_weight_kg, target_reps, default_sets, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("training_records")
        .select("exercise_name, weight_kg, reps, trained_at")
        .eq("set_num", 1)
        .order("trained_at", { ascending: false }),
    ]);

    if (exErr) throw exErr;
    if (recErr) throw recErr;

    // Latest record per exercise (already sorted desc by date)
    const latestByName: Record<string, { weight_kg: number; reps: number }> = {};
    for (const r of records ?? []) {
      if (!latestByName[r.exercise_name]) {
        latestByName[r.exercise_name] = { weight_kg: r.weight_kg, reps: r.reps };
      }
    }

    const byPart: Record<string, ExercisePlan[]> = {};
    for (const ex of exList ?? []) {
      const part = ex.body_part;
      if (!byPart[part]) byPart[part] = [];
      byPart[part].push({
        id: ex.id,
        種目名: ex.name,
        部位: part,
        目標重量kg: ex.target_weight_kg,
        目標レップ数: ex.target_reps,
        セット数: ex.default_sets,
        前回重量kg: latestByName[ex.name]?.weight_kg ?? null,
        前回レップ数: latestByName[ex.name]?.reps ?? null,
      });
    }

    return NextResponse.json(byPart);
  } catch (error) {
    console.error("Exercises error:", error);
    return NextResponse.json({ error: "種目の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from("exercises")
      .insert({
        name: body.name,
        body_part: body.body_part,
        default_sets: body.default_sets ?? 3,
        target_weight_kg: body.target_weight_kg ?? 0,
        target_reps: body.target_reps ?? 10,
        sort_order: body.sort_order ?? 99,
      })
      .select("id, name, body_part, target_weight_kg, target_reps, default_sets, sort_order")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("Exercise add error:", error);
    return NextResponse.json({ error: "種目の追加に失敗しました", detail: String(error) }, { status: 500 });
  }
}
