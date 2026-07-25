import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 更新可能な列を明示する（任意の列を書き換えられないようにするため）
    const ALLOWED = [
      "name", "body_part", "target_weight_kg", "target_reps",
      "default_sets", "warmup_sets", "tier", "sort_order",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    if (body.tier !== undefined && !["core", "bonus", "hold"].includes(body.tier)) {
      return NextResponse.json({ error: "tier は core / bonus / hold のいずれかです" }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "更新対象の項目がありません" }, { status: 400 });
    }

    const { error } = await supabase.from("exercises").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "更新に失敗しました", detail: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabase.from("exercises").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "削除に失敗しました", detail: String(error) }, { status: 500 });
  }
}
