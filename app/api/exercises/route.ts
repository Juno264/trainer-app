import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { ExercisePlan } from "../../lib/types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function GET() {
  try {
    // 種目マスタと前回実績を並行取得
    const [exRes, recordRes] = await Promise.all([
      notion.dataSources.query({ data_source_id: process.env.NOTION_EXERCISE_DS! }),
      notion.dataSources.query({ data_source_id: process.env.NOTION_RECORD_DS! }),
    ]);

    // 前回実績（セット1）を種目名ごとに取得
    const latestRecords: Record<string, { 重量kg: number; レップ数: number }> = {};
    const latestByName: Record<string, { date: string; 重量kg: number; レップ数: number }> = {};
    for (const page of recordRes.results) {
      if (page.object !== "page" || !("properties" in page)) continue;
      const props = (page as PageObjectResponse).properties as Record<string, {
        title?: Array<{ plain_text: string }>;
        number?: number | null;
        date?: { start: string } | null;
      }>;
      const name = props["種目名"]?.title?.[0]?.plain_text ?? "";
      const date = props["実施日"]?.date?.start ?? "";
      const setNum = props["セット数"]?.number ?? 0;
      const weight = props["重量kg"]?.number ?? 0;
      const reps = props["レップ数"]?.number ?? 0;
      if (!name || setNum !== 1) continue;
      if (!latestByName[name] || date > latestByName[name].date) {
        latestByName[name] = { date, 重量kg: weight, レップ数: reps };
      }
    }
    for (const [name, val] of Object.entries(latestByName)) {
      latestRecords[name] = { 重量kg: val.重量kg, レップ数: val.レップ数 };
    }

    // 部位ごとにグループ化して返す
    const byPart: Record<string, ExercisePlan[]> = {};
    for (const page of exRes.results) {
      if (page.object !== "page" || !("properties" in page)) continue;
      const props = (page as PageObjectResponse).properties as Record<string, {
        title?: Array<{ plain_text: string }>;
        number?: number | null;
        select?: { name: string } | null;
      }>;
      const 部位 = props["部位"]?.select?.name ?? "";
      const 種目名 = props["種目名"]?.title?.[0]?.plain_text ?? "";
      if (!部位 || !種目名) continue;
      if (!byPart[部位]) byPart[部位] = [];
      byPart[部位].push({
        id: page.id,
        種目名,
        部位,
        目標重量kg: props["目標重量kg"]?.number ?? 0,
        目標レップ数: props["目標レップ数"]?.number ?? 0,
        セット数: props["セット数"]?.number ?? 3,
        前回重量kg: latestRecords[種目名]?.重量kg ?? null,
        前回レップ数: latestRecords[種目名]?.レップ数 ?? null,
      });
    }

    return NextResponse.json(byPart);
  } catch (error) {
    console.error("Exercises error:", error);
    return NextResponse.json({ error: "種目の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
