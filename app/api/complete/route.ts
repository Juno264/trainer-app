import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SetData = {
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number;
  achieved: "達成" | "未達" | "部分達成";
};

type ExerciseData = {
  menuItemId: string;
  name: string;
  targetWeight: number;
  targetReps: number;
  sets: SetData[];
};

type CompleteBody = {
  day: string;
  condition: "良好" | "普通" | "疲れ気味";
  memo: string;
  exercises: ExerciseData[];
};

type ClaudeExercise = {
  name: string;
  nextWeight: number;
  adjustment: "重量UP" | "維持" | "重量DOWN";
};

type ClaudeResult = {
  overall: "好調" | "普通" | "要注意";
  achievementRate: number;
  weightComparison: "重量UP" | "維持" | "重量DOWN";
  review: string;
  nextInstruction: string;
  nextWeightMemo: string;
  exercises: ClaudeExercise[];
};

export async function POST(request: NextRequest) {
  const body: CompleteBody = await request.json();
  const { day, condition, memo, exercises } = body;
  const today = new Date().toISOString().split("T")[0];

  // 前回トレーニングからの日数を計算
  let daysSinceLastTraining = 0;
  try {
    const lastRecord = await notion.dataSources.query({
      data_source_id: process.env.NOTION_RECORD_DB!,
      filter: { property: "Day", select: { equals: day } },
      sorts: [{ property: "日付", direction: "descending" }],
      page_size: 1,
    });
    const lastPage = lastRecord.results.find(
      (p): p is PageObjectResponse => p.object === "page" && "properties" in p
    );
    if (lastPage) {
      const dateProps = lastPage.properties as Record<string, { date?: { start: string } | null }>;
      const lastDate = dateProps["日付"]?.date?.start;
      if (lastDate) {
        const diff =
          (new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
        daysSinceLastTraining = Math.round(diff);
      }
    }
  } catch (e) {
    console.error("Failed to get last training date:", e);
  }

  // Notionのトレーニング記録DBに書き込む
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      try {
        await notion.pages.create({
          parent: { database_id: process.env.NOTION_RECORD_DB! },
          properties: {
            種目名: { title: [{ text: { content: exercise.name } }] },
            日付: { date: { start: today } },
            Day: { select: { name: day } },
            セット数: { number: set.setNumber },
            重量kg: { number: set.weight },
            レップ数: { number: set.reps },
            目標重量kg: { number: exercise.targetWeight },
            目標レップ数: { number: exercise.targetReps },
            達成: { select: { name: set.achieved } },
            RPE: { number: set.rpe },
            体調: { select: { name: condition } },
            前回からの日数: { number: daysSinceLastTraining },
            メモ: { rich_text: [{ text: { content: memo || "" } }] },
          },
        });
      } catch (e) {
        console.error("Failed to write training record:", e);
      }
    }
  }

  // Claudeへのプロンプトを構築
  const recordSummary = exercises
    .map((ex) => {
      const achievedCount = ex.sets.filter((s) => s.achieved === "達成").length;
      const avgRpe =
        ex.sets.length > 0
          ? Math.round(ex.sets.reduce((sum, s) => sum + s.rpe, 0) / ex.sets.length)
          : 0;
      const setDetails = ex.sets
        .map(
          (s) =>
            `  Set${s.setNumber}: ${s.weight}kg × ${s.reps}reps (RPE: ${s.rpe}, ${s.achieved})`
        )
        .join("\n");
      return `【${ex.name}】\n目標: ${ex.targetWeight}kg × ${ex.targetReps}reps\n${setDetails}\n達成率: ${achievedCount}/${ex.sets.length}セット, 平均RPE: ${avgRpe}`;
    })
    .join("\n\n");

  const userPrompt = `以下のトレーニング記録を分析してください。

Day: ${day}
体調: ${condition}
前回からの日数: ${daysSinceLastTraining}日
メモ: ${memo || "なし"}

${recordSummary}

以下のJSON形式のみで回答してください（説明文不要）:
{
  "overall": "好調または普通または要注意",
  "achievementRate": 0から100の整数,
  "weightComparison": "重量UPまたは維持または重量DOWN",
  "review": "トレーニング全体のレビュー（200文字以内）",
  "nextInstruction": "次回への具体的な指示（100文字以内）",
  "nextWeightMemo": "重量調整の根拠（100文字以内）",
  "exercises": [
    {
      "name": "種目名",
      "nextWeight": 次回目標重量の数値,
      "adjustment": "重量UPまたは維持または重量DOWN"
    }
  ]
}`;

  // Claude APIを呼び出す
  let claudeResult: ClaudeResult = {
    overall: "普通",
    achievementRate: 0,
    weightComparison: "維持",
    review: "レビューの生成に失敗しました。",
    nextInstruction: "前回と同じ重量で続けてください。",
    nextWeightMemo: "AI分析エラー",
    exercises: exercises.map((ex) => ({
      name: ex.name,
      nextWeight: ex.targetWeight,
      adjustment: "維持" as const,
    })),
  };

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "あなたはパーソナルトレーナーです。トレーニング記録を分析し、日本語でレビューと次回の目標重量を提案してください。RPEと達成率を考慮して、RPE7以下かつ全セット達成なら+2.5kg、RPE8-9かつ全セット達成なら同重量維持、未達またはRPE10なら-2.5kgを基本ルールとしてください。前回から10日以上空いた場合は重量を10%落としてください。",
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      claudeResult = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Claude API error:", e);
  }

  // ClaudeレビューDBに書き込む
  try {
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_REVIEW_DB! },
      properties: {
        レビュータイトル: { title: [{ text: { content: `${today} ${day}` } }] },
        日付: { date: { start: today } },
        Day: { select: { name: day } },
        総合評価: { select: { name: claudeResult.overall } },
        達成率: { number: claudeResult.achievementRate },
        前回比: { select: { name: claudeResult.weightComparison } },
        レビュー本文: { rich_text: [{ text: { content: claudeResult.review } }] },
        次回への指示: { rich_text: [{ text: { content: claudeResult.nextInstruction } }] },
        次回重量調整メモ: { rich_text: [{ text: { content: claudeResult.nextWeightMemo } }] },
      },
    });
  } catch (e) {
    console.error("Failed to write review:", e);
  }

  // 次回メニューDBの目標重量を更新
  for (const exercise of exercises) {
    const claudeEx = claudeResult.exercises?.find((e) => e.name === exercise.name);
    if (claudeEx) {
      try {
        await notion.pages.update({
          page_id: exercise.menuItemId,
          properties: {
            目標重量kg: { number: claudeEx.nextWeight },
            調整理由: {
              rich_text: [
                {
                  text: {
                    content: `${claudeEx.adjustment}: ${claudeResult.nextWeightMemo}`,
                  },
                },
              ],
            },
            最終更新日: { date: { start: today } },
          },
        });
      } catch (e) {
        console.error("Failed to update next menu:", e);
      }
    }
  }

  return NextResponse.json({
    review: {
      overall: claudeResult.overall,
      achievementRate: claudeResult.achievementRate,
      review: claudeResult.review,
      nextInstruction: claudeResult.nextInstruction,
      nextWeightMemo: claudeResult.nextWeightMemo,
    },
  });
}
