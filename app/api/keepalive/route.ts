import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

// Supabase無料プランは1週間アクセスが無いと自動停止するため、
// Vercel Cronから毎日呼び出して起こし続ける。
// CDNやISRでキャッシュされると実際にDBへ到達しないので明示的に動的化する。
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // CRON_SECRET が設定されている場合のみ認証を要求する（未設定なら誰でも実行可）
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 最小コストの読み取りクエリでDBを起こす
    const { error } = await supabase
      .from("body_parts")
      .select("name")
      .limit(1);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Keepalive failed:", error);
    return NextResponse.json(
      { ok: false, error: "keepalive failed", detail: String(error) },
      { status: 500 }
    );
  }
}
