import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
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

  // 1. トレーニング記録DBに書き込む
  for (const record of records) {
    for (let i = 0; i < record.sets.length; i++) {
      const set = record.sets[i];
      const achieved = set.達成
        ? "達成"
        : set.重量kg >= set.目標重量kg && set.レップ数 >= set.目標レップ数
        ? "部分達成"
        : "未達";
      try {
        await notion.pages.create({
          parent: { database_id: process.env.NOTION_RECORD_DB! },
          properties: {
            種目名: { title: [{ text: { content: record.種目名 } }] },
            実施日: { date: { start: today } },
            部位: { select: { name: 部位 } },
            重量kg: { number: set.重量kg },
            レップ数: { number: set.レップ数 },
            セット数: { number: i + 1 },
            目標重量kg: { number: set.目標重量kg },
            目標レップ数: { number: set.目標レップ数 },
            達成: { select: { name: achieved } },
            RPE: { number: record.RPE },
            体調: { select: { name: record.体調 } },
            メモ: { rich_text: [{ text: { content: record.メモ || "" } }] },
          },
        });
      } catch (e) {
        console.error("Failed to write record:", e);
      }
    }
  }

  // 2. Claude APIでレビュー生成
  const summary = records.map((r) => {
    const achievedCount = r.sets.filter((s) => s.達成).length;
    const setDetails = r.sets
      .map((s, i) => `  Set${i + 1}: ${s.重量kg}kg×${s.レップ数}rep (目標:${s.目標重量kg}kg×${s.目標レップ数}rep, ${s.達成 ? "達成" : "未達"})`)
      .join("\n");
    return `【${r.種目名}】\n${setDetails}\n達成: ${achievedCount}/${r.sets.length}セット, RPE: ${r.RPE}`;
  }).join("\n\n");

  const userPrompt = `以下のトレーニング記録を分析してください。
部位: ${部位}
体調: ${体調}

${summary}

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
      max_tokens: 1024,
      system: `あなたはパーソナルトレーナーです。トレーニング記録を分析し、日本語でレビューと次回の目標重量を提案してください。
ルール：
- RPE7以下かつ全セット達成 → 次回+2.5kg
- RPE8〜9かつ全セット達成 → 次回同重量維持
- 未達またはRPE10 → 次回-2.5kg
- 自重種目（目標重量0kg）はレップ数で評価してください
レスポンスはJSON形式のみで返してください。`,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) claudeResult = JSON.parse(match[0]);
  } catch (e) {
    console.error("Claude error:", e);
  }

  // 3. ClaudeレビューDBに書き込む
  try {
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_REVIEW_DB! },
      properties: {
        レビュータイトル: { title: [{ text: { content: `${today} ${部位}` } }] },
        実施日: { date: { start: today } },
        部位: { select: { name: 部位 } },
        総合評価: { select: { name: claudeResult.総合評価 } },
        達成率: { number: claudeResult.達成率 },
        前回比: { select: { name: claudeResult.前回比 } },
        レビュー本文: { rich_text: [{ text: { content: claudeResult.レビュー本文 } }] },
        次回への指示: { rich_text: [{ text: { content: claudeResult.次回への指示 } }] },
        次回重量調整メモ: {
          rich_text: [{
            text: {
              content: claudeResult.種目別次回目標
                .map((e) => `${e.種目名}: ${e.調整理由}`)
                .join(", "),
            },
          }],
        },
      },
    });
  } catch (e) {
    console.error("Failed to write review:", e);
  }

  // 4. 種目マスタの目標値を更新
  for (const target of claudeResult.種目別次回目標) {
    const exercise = records.find((r) => r.種目名 === target.種目名);
    if (!exercise?.id) continue;
    try {
      await notion.pages.update({
        page_id: exercise.id,
        properties: {
          目標重量kg: { number: target.目標重量kg },
          目標レップ数: { number: target.目標レップ数 },
          調整理由: { rich_text: [{ text: { content: target.調整理由 } }] },
          最終更新日: { date: { start: today } },
        },
      });
    } catch (e) {
      console.error("Failed to update exercise:", e);
    }
  }

  // 5. 部位マスタの最終実施日を更新
  try {
    const buiRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_BUIMASTER_DS!,
    });
    const buiPage = buiRes.results
      .filter((p): p is PageObjectResponse => p.object === "page" && "properties" in p)
      .find((page) => {
        const props = page.properties as Record<string, { title?: Array<{ plain_text: string }> }>;
        return props["部位名"]?.title?.[0]?.plain_text === 部位;
      });
    if (buiPage) {
      await notion.pages.update({
        page_id: buiPage.id,
        properties: { 最終実施日: { date: { start: today } } },
      });
    }
  } catch (e) {
    console.error("Failed to update 部位マスタ:", e);
  }

  return NextResponse.json({
    総合評価: claudeResult.総合評価,
    達成率: claudeResult.達成率,
    前回比: claudeResult.前回比,
    レビュー本文: claudeResult.レビュー本文,
    次回への指示: claudeResult.次回への指示,
  });
}
