import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

export async function GET() {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const fromDate = threeMonthsAgo.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("training_records")
      .select("trained_at, body_part")
      .gte("trained_at", fromDate)
      .order("trained_at", { ascending: true });

    if (error) throw error;

    const calendar: Record<string, string[]> = {};
    for (const r of data ?? []) {
      if (!calendar[r.trained_at]) calendar[r.trained_at] = [];
      if (!calendar[r.trained_at].includes(r.body_part)) {
        calendar[r.trained_at].push(r.body_part);
      }
    }

    return NextResponse.json(calendar);
  } catch (error) {
    return NextResponse.json({ error: "カレンダーの取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
