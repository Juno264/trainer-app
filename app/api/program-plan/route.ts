import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import type { TodayPlan } from "../../lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 「今日やる部位」を program_plan から引く。
 *
 * program_plan は曜日固定ではなく「anchor_date を起点とした cycle_length 日の周期」。
 * 例: cycle4_3on1off は 4日周期で 0=胸/1=背中/2=脚/3=休養。
 * 何曜日かではなく anchor_date からの経過日数で位置が決まるため、
 * 曜日で引いてはいけない。
 *
 * 日付は日本時間で判定する。サーバーはUTCで動くため、そのまま扱うと
 * 日本時間の早朝〜午前9時前が前日として計算されてしまう。
 *
 * program_plan は予定、body_parts.recovery_hours は安全装置という役割分担なので、
 * ここでは回復状況の判定を行わない（/api/recommend がそのまま担当する）。
 */
export async function GET() {
  try {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("program_plan")
      .select("phase, body_part, cardio_minutes, note, anchor_date, cycle_length, cycle_position, effective_from, effective_to")
      .lte("effective_from", today)
      .order("effective_from", { ascending: false });

    if (error) throw error;

    // effective_to が null（無期限）か今日以降のものが有効。
    // 期間が重なる場合は effective_from が新しいフェーズを優先する。
    const active = (data ?? []).filter((r) => !r.effective_to || r.effective_to >= today);
    const phase = active[0];
    if (!phase?.anchor_date || !phase.cycle_length) {
      return NextResponse.json({ plan: null });
    }

    // 日付のみで差分を取る（時刻・タイムゾーンの影響を受けないようUTC正午で固定）
    const toUtcNoon = (d: string) => Date.parse(`${d}T12:00:00Z`);
    const daysSince = Math.round((toUtcNoon(today) - toUtcNoon(phase.anchor_date)) / DAY_MS);
    // anchor_date より前の日でも負にならないよう二重に剰余を取る
    const position = ((daysSince % phase.cycle_length) + phase.cycle_length) % phase.cycle_length;

    const row = active.find(
      (r) => r.effective_from === phase.effective_from && r.cycle_position === position
    );

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
