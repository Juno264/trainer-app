import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SetRecord = {
  重量kg: number;
  レップ数: number;
  目標重量kg: number;
  目標レップ数: number;
  達成: boolean;
};

type ExerciseRecord = {
  id: string;
  種目名: string;
  sets: SetRecord[];
  RPE: number;
  体調: "良好" | "普通" | "疲れ気味";
  メモ: string;
};

type CompleteBody = {
  部位: string;
  実施日: string;
  records: ExerciseRecord[];
};

type ClaudeTarget = {
  種目名: string;
  目標重量kg: number;
  目標レップ数: number;
  調整理由: string;
};

type ClaudeReview = {
  総合評価: "好調" | "普通" | "要注意";
  達成率: number;
  前回比: "重量UP" | "維持" | "重量DOWN";
  レビュー本文: string;
  次回への指示: string;
  種目別次回目標: ClaudeTarget[];
};

export async function POST(request: NextRequest) {
  const body: CompleteBody = await request.json();
  const { 部位, 実施日, records } = body;
  const today = 実施日 || new Date().toISOString().split("T")[0];
  const 体調 = records[0]?.体調 ?? "普通";

  // 1. トレーニング記録をSupabaseに書き込む
  const recordRows = records.flatMap((record) =>
    record.sets.map((set, i) => ({
      exercise_name: record.種目名,
      body_part: 部位,
      trained_at: today,
      set_num: i + 1,
      weight_kg: set.重量kg,
      reps: set.レップ数,
      target_weight_kg: set.目標重量kg,
      target_reps: set.目標レップ数,
      achieved: set.達成,
      rpe: record.RPE,
      condition: record.体調,
      memo: record.メモ || "",
    }))
  );

  const { error: insertErr } = await supabase
    .from("training_records")
    .upsert(recordRows, { onConflict: "exercise_name,trained_at,set_num", ignoreDuplicates: true });
  if (insertErr) console.error("Failed to insert records:", insertErr);

  // 2. 前回実績を取得してClaudeに渡す
  let historySummary = "";
  try {
    const { data: prevRecords } = await supabase
      .from("training_records")
      .select("exercise_name, weight_kg, reps")
      .lt("trained_at", today)
      .order("trained_at", { ascending: false });

    const prevBests: Record<string, { weight_kg: number; reps: number }> = {};
    for (const r of prevRecords ?? []) {
      if (!prevBests[r.exercise_name] || r.weight_kg > prevBests[r.exercise_name].weight_kg) {
        prevBests[r.exercise_name] = { weight_kg: r.weight_kg, reps: r.reps };
      }
    }

    const histLines = records
      .map((r) => {
        const prev = prevBests[r.種目名];
        return prev
          ? `${r.種目名}: 前回最高 ${prev.weight_kg > 0 ? prev.weight_kg + "kg" : "自重"}×${prev.reps}rep`
          : `${r.種目名}: 初回`;
      })
      .join("\n");

    historySummary = `\n\n前回までの記録:\n${histLines}`;
  } catch (e) {
    console.error("Failed to fetch history:", e);
  }

  // 3. Claude APIでレビュー生成
  const summary = records
    .map((r) => {
      const achievedCount = r.sets.filter((s) => s.達成).length;
      const setDetails = r.sets
        .map(
          (s, i) =>
            `  Set${i + 1}: ${s.重量kg > 0 ? s.重量kg + "kg" : "自重"}×${s.レップ数}rep (目標:${s.目標重量kg > 0 ? s.目標重量kg + "kg" : "自重"}×${s.目標レップ数}rep, ${s.達成 ? "達成" : "未達"})`
        )
        .join("\n");
      return `【${r.種目名}】\n${setDetails}\n達成: ${achievedCount}/${r.sets.length}セット, RPE: ${r.RPE}`;
    })
    .join("\n\n");

  const userPrompt = `以下のトレーニング記録を分析してください。
部位: ${部位}
体調: ${体調}

今回の記録:
${summary}${historySummary}

以下のJSON形式のみで回答してください:
{
  "総合評価": "好調または普通または要注意",
  "達成率": 0から100の整数,
  "前回比": "重量UPまたは維持または重量DOWN",
  "レビュー本文": "200文字以内のレビュー",
  "次回への指示": "100文字以内の指示",
  "種目別次回目標": [
    {"種目名": "種目名", "目標重量kg": 数値, "目標レップ数": 数値, "調整理由": "理由"}
  ]
}`;

  let claudeResult: ClaudeReview = {
    総合評価: "普通",
    達成率: 0,
    前回比: "維持",
    レビュー本文: "レビューの生成に失敗しました。",
    次回への指示: "前回と同じ内容で続けてください。",
    種目別次回目標: records.map((r) => ({
      種目名: r.種目名,
      目標重量kg: r.sets[0]?.目標重量kg ?? 0,
      目標レップ数: r.sets[0]?.目標レップ数 ?? 0,
      調整理由: "AI分析エラー",
    })),
  };

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `あなたはパーソナルトレーナーです。トレーニング記録を分析し、日本語でレビューと次回の目標重量を提案してください。
ルール:
- 前回比は「前回までの記録」と今回の実績重量を比較して判定してください（初回は「維持」）
- RPE7以下かつ全セット達成 → 次回+2.5kg（自重種目はレップ数+2）
- RPE8〜9かつ全セット達成 → 次回同重量維持
- 未達またはRPE10 → 次回-2.5kg（自重種目はレップ数-2）
- 自重種目（目標重量0kg）の目標重量kgは0のままにしてください
レスポンスはJSON形式のみで返してください。`,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) claudeResult = JSON.parse(match[0]);
  } catch (e) {
    console.error("Claude error:", e);
  }

  // 4. レビューをSupabaseに保存
  const { error: reviewErr } = await supabase.from("reviews").upsert(
    {
      body_part: 部位,
      trained_at: today,
      overall_rating: claudeResult.総合評価,
      achievement_rate: claudeResult.達成率,
      weight_change: claudeResult.前回比,
      review_text: claudeResult.レビュー本文,
      next_instruction: claudeResult.次回への指示,
      weight_adjustment_memo: claudeResult.種目別次回目標
        .map((e) => `${e.種目名}: ${e.調整理由}`)
        .join(", "),
    },
    { onConflict: "body_part,trained_at" }
  );
  if (reviewErr) console.error("Failed to save review:", reviewErr);

  // 5. 種目マスタの目標値を更新
  await Promise.all(
    claudeResult.種目別次回目標.map(async (target) => {
      const exercise = records.find((r) => r.種目名 === target.種目名);
      if (!exercise?.id) return;
      const { error } = await supabase
        .from("exercises")
        .update({
          target_weight_kg: target.目標重量kg,
          target_reps: target.目標レップ数,
          adjustment_reason: target.調整理由,
          last_updated_at: today,
        })
        .eq("id", exercise.id);
      if (error) console.error("Failed to update exercise:", error);
    })
  );

  // 6. 部位マスタの最終実施日を更新
  const { error: partErr } = await supabase
    .from("body_parts")
    .update({ last_trained_at: today })
    .eq("name", 部位);
  if (partErr) console.error("Failed to update body_parts:", partErr);

  return NextResponse.json({
    総合評価: claudeResult.総合評価,
    達成率: claudeResult.達成率,
    前回比: claudeResult.前回比,
    レビュー本文: claudeResult.レビュー本文,
    次回への指示: claudeResult.次回への指示,
  });
}
