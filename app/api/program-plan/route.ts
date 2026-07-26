import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import type { TodayPlan } from "../../lib/types";

/**
 * 「今日やる部位」を program_plan から引く。
 * program_plan は予定、body_parts.recovery_hours は安全装置という役割分担なので、
 * ここでは回復状況の判定を行わない（/api/recommend がそのまま担当する）。
 *
 * 曜日判定はJST基準。サーバーはUTCで動くため、そのまま getDay() すると
 * 日本時間の早朝〜午前9時前が前日の曜日として扱われてしまう。
 */
export async function GET() {
  try {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = jst.toISOString().split("T")[0];
    const dow = jst.getUTCDay() === 0 ? 7 : jst.getUTCDay(); // 1=月 〜 7=日

    const { data, error } = await supabase
      .from("program_plan")
      .select("phase, body_part, cardio_minutes, note, effective_from, effective_to")
      .eq("day_of_week", dow)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false });

    if (error) throw error;

    // effective_to が null（無期限）か、今日以降のものが有効。
    // 期間が重なる場合は effective_from が新しいフェーズを優先する。
    const row = (data ?? []).find((r) => !r.effective_to || r.effective_to >= today);

    const plan: TodayPlan | null = row
      ? {
          日付: today,
          フェーズ: row.phase,
          部位: row.body_part,
          有酸素分: row.cardio_minutes,
          メモ: row.note,
        }
      : null;

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Program plan error:", error);
    return NextResponse.json(
      { error: "予定の取得に失敗しました", detail: String(error) },
      { status: 500 }
    );
  }
}
