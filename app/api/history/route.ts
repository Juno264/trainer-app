import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { HistorySession, HistoryReview, Rating, WeightChange } from "../../lib/types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function GET() {
  try {
    // トレーニング記録を取得
    const recordRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_RECORD_DS!,
    });

    // セッション（実施日×部位）ごとに記録をグループ化
    type RawSet = { setNum: number; 重量kg: number; レップ数: number; 達成: boolean; rpe: number };
    type RawExercise = { sets: RawSet[] };
    const sessions: Record<string, { 部位: string; exercises: Record<string, RawExercise> }> = {};

    for (const page of recordRes.results) {
      if (page.object !== "page" || !("properties" in page)) continue;
      const props = (page as PageObjectResponse).properties as Record<string, {
        title?: Array<{ plain_text: string }>;
        number?: number | null;
        date?: { start: string } | null;
        select?: { name: string } | null;
        rich_text?: Array<{ plain_text: string }>;
      }>;
      const 種目名 = props["種目名"]?.title?.[0]?.plain_text ?? "";
      const date = props["実施日"]?.date?.start ?? "";
      const 部位 = props["部位"]?.select?.name ?? "";
      const 重量kg = props["重量kg"]?.number ?? 0;
      const レップ数 = props["レップ数"]?.number ?? 0;
      const setNum = props["セット数"]?.number ?? 0;
      const 達成 = props["達成"]?.select?.name === "達成";
      const rpe = props["RPE"]?.number ?? 0;
      if (!種目名 || !date || !部位) continue;

      const key = `${date}__${部位}`;
      if (!sessions[key]) sessions[key] = { 部位, exercises: {} };
      if (!sessions[key].exercises[種目名]) sessions[key].exercises[種目名] = { sets: [] };
      sessions[key].exercises[種目名].sets.push({ setNum, 重量kg, レップ数, 達成, rpe });
    }

    // レビューを取得して日付×部位でインデックス化
    const reviews: Record<string, HistoryReview> = {};
    try {
      const reviewRes = await notion.dataSources.query({
        data_source_id: process.env.NOTION_REVIEW_DS!,
      });
      for (const page of reviewRes.results) {
        if (page.object !== "page" || !("properties" in page)) continue;
        const props = (page as PageObjectResponse).properties as Record<string, {
          title?: Array<{ plain_text: string }>;
          number?: number | null;
          date?: { start: string } | null;
          select?: { name: string } | null;
          rich_text?: Array<{ plain_text: string }>;
        }>;
        const date = props["実施日"]?.date?.start ?? "";
        const 部位 = props["部位"]?.select?.name ?? "";
        const 総合評価 = (props["総合評価"]?.select?.name ?? "普通") as Rating;
        const 達成率 = props["達成率"]?.number ?? 0;
        const 前回比 = (props["前回比"]?.select?.name ?? "維持") as WeightChange;
        const レビュー本文 = props["レビュー本文"]?.rich_text?.[0]?.plain_text ?? "";
        const 次回への指示 = props["次回への指示"]?.rich_text?.[0]?.plain_text ?? "";
        if (!date || !部位) continue;
        reviews[`${date}__${部位}`] = { 総合評価, 達成率, 前回比, レビュー本文, 次回への指示 };
      }
    } catch (e) {
      console.error("Failed to fetch reviews:", e);
    }

    // セッションを整形して直近10件を返す
    const result: HistorySession[] = Object.entries(sessions)
      .map(([key, session]) => ({
        date: key.split("__")[0],
        部位: session.部位,
        exercises: Object.entries(session.exercises).map(([種目名, ex]) => ({
          種目名,
          sets: ex.sets
            .sort((a, b) => a.setNum - b.setNum)
            .map((s) => ({ 重量kg: s.重量kg, レップ数: s.レップ数, 達成: s.達成 })),
          rpe: ex.sets[0]?.rpe ?? 0,
        })),
        review: reviews[key] ?? null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    return NextResponse.json(result);
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ error: "履歴の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
