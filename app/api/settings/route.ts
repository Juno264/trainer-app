import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import { DEFAULT_BODY_WEIGHT } from "../../lib/load";

export const dynamic = "force-dynamic";

/** 体重は自重種目の実効負荷（＝推定1RM）計算に使う */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "body_weight_kg")
      .maybeSingle();
    if (error) throw error;

    const parsed = Number(data?.value);
    return NextResponse.json({
      体重kg: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BODY_WEIGHT,
    });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "設定の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const weight = Number(body.体重kg);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 300) {
      return NextResponse.json({ error: "体重は0〜300kgの範囲で指定してください" }, { status: 400 });
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "body_weight_kg", value: String(weight), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;

    return NextResponse.json({ 体重kg: weight });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json({ error: "設定の保存に失敗しました", detail: String(error) }, { status: 500 });
  }
}
