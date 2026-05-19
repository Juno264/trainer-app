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
      .select("trained_at, weight_kg, reps")
      .eq("exercise_name", exercise)
      .eq("set_num", 1)
      .order("trained_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ exercise, data: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: "統計の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
