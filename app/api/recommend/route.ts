import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

const CARDIO = "有酸素（プール）";
const JISABURI_HOURS = 120;

type PartStatus = "未実施" | "疲労中" | "回復済み" | "久しぶり";

export async function GET() {
  try {
    const { data: parts, error } = await supabase
      .from("body_parts")
      .select("name, recovery_hours, last_trained_at")
      .neq("name", CARDIO);

    if (error) throw error;

    const now = new Date();
    const bodyParts = (parts ?? [])
      .filter((p) => !p.name.startsWith("_"))
      .map((p) => {
        const lastDate = p.last_trained_at ? new Date(p.last_trained_at) : null;
        const elapsedHours = lastDate
          ? (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60)
          : Infinity;
        const recoveryHours: number = p.recovery_hours;

        let 状態: PartStatus;
        if (elapsedHours === Infinity) 状態 = "未実施";
        else if (elapsedHours < recoveryHours) 状態 = "疲労中";
        else if (elapsedHours >= JISABURI_HOURS) 状態 = "久しぶり";
        else 状態 = "回復済み";

        const 回復進捗 =
          elapsedHours === Infinity ? 1.5
          : 状態 === "久しぶり" ? 1.5
          : Math.min(1.5, elapsedHours / recoveryHours);

        return {
          名前: p.name,
          経過日数: elapsedHours === Infinity ? 0 : Math.floor(elapsedHours / 24),
          回復目安日数: Math.round(recoveryHours / 24),
          回復進捗,
          状態,
          おすすめ: false,
          _sortKey: elapsedHours === Infinity ? Infinity : elapsedHours / recoveryHours,
          _疲労中: 状態 === "疲労中",
        };
      });

    bodyParts.sort((a, b) => {
      if (a._疲労中 !== b._疲労中) return a._疲労中 ? 1 : -1;
      return b._sortKey - a._sortKey;
    });

    if (bodyParts.length > 0) bodyParts[0].おすすめ = true;

    const result = bodyParts.map(({ _sortKey: _s, _疲労中: _f, ...bp }) => bp);
    return NextResponse.json({ 部位リスト: result });
  } catch (error) {
    console.error("Recommend error:", error);
    return NextResponse.json({ error: "取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
