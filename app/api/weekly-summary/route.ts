import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [{ data: records }, { data: reviews }, { data: prevRecords }] = await Promise.all([
      supabase
        .from("training_records")
        .select("exercise_name, body_part, trained_at, weight_kg, reps, achieved, rpe, condition")
        .gte("trained_at", sevenDaysAgo)
        .order("trained_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("body_part, trained_at, overall_rating, review_text")
        .gte("trained_at", sevenDaysAgo)
        .order("trained_at", { ascending: false }),
      supabase
        .from("training_records")
        .select("exercise_name, weight_kg, reps")
        .gte("trained_at", fourteenDaysAgo)
        .lt("trained_at", sevenDaysAgo)
        .eq("set_num", 1),
    ]);

    if (!records || records.length === 0) {
      return NextResponse.json({
        summary: "この1週間にトレーニング記録がありません。",
        period: { from: sevenDaysAgo, to: today },
        sessionCount: 0,
      });
    }

    // セッション数と部位別回数を集計
    const sessionSet = new Set<string>();
    const partCount: Record<string, number> = {};
    for (const r of records) {
      const key = `${r.trained_at}__${r.body_part}`;
      if (!sessionSet.has(key)) {
        sessionSet.add(key);
        partCount[r.body_part] = (partCount[r.body_part] || 0) + 1;
      }
    }

    const partSummary = Object.entries(partCount).map(([p, c]) => `${p}${c}回`).join("・");

    // 前週比で重量アップした種目を検出
    const prevBests: Record<string, number> = {};
    for (const r of prevRecords ?? []) {
      if (!prevBests[r.exercise_name] || r.weight_kg > prevBests[r.exercise_name]) {
        prevBests[r.exercise_name] = r.weight_kg;
      }
    }
    const currBests: Record<string, number> = {};
    for (const r of records) {
      if (!currBests[r.exercise_name] || r.weight_kg > currBests[r.exercise_name]) {
        currBests[r.exercise_name] = r.weight_kg;
      }
    }
    const ups = Object.entries(currBests)
      .filter(([name, w]) => prevBests[name] && w > prevBests[name])
      .map(([name, w]) => `${name}(${prevBests[name]}→${w}kg)`)
      .join("、");

    const reviewSummary = reviews?.map((r) => `${r.body_part}: ${r.overall_rating}`).join("、") ?? "";
    const avgRpe = records.length > 0
      ? Math.round(records.reduce((s, r) => s + (r.rpe ?? 0), 0) / records.length * 10) / 10
      : 0;

    const prompt = `以下のデータをもとに、1週間のトレーニングサマリーを日本語200文字以内で生成してください。
期間: ${sevenDaysAgo} 〜 ${today}
実施: ${sessionSet.size}回（${partSummary}）
平均RPE: ${avgRpe}
${ups ? `重量アップ: ${ups}` : ""}
${reviewSummary ? `評価: ${reviewSummary}` : ""}
来週へのアドバイスを1文含めてください。数字を積極的に使い、具体的に書いてください。`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = msg.content[0].type === "text" ? msg.content[0].text : "サマリーの生成に失敗しました。";

    return NextResponse.json({
      summary,
      period: { from: sevenDaysAgo, to: today },
      sessionCount: sessionSet.size,
    });
  } catch (error) {
    console.error("Weekly summary error:", error);
    return NextResponse.json({ error: "サマリーの取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
