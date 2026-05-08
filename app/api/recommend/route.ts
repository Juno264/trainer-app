import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function GET() {
  try {
    const buiRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_BUIMASTER_DS!,
    });

    const now = new Date();

    type BodyPartRecord = {
      id: string;
      name: string;
      lastDate: string | null;
      recoveryHours: number;
      elapsedHours: number;
    };

    const bodyParts: BodyPartRecord[] = buiRes.results
      .filter((p): p is PageObjectResponse => p.object === "page" && "properties" in p)
      .map((page) => {
        const props = page.properties as Record<string, {
          title?: Array<{ plain_text: string }>;
          date?: { start: string } | null;
          number?: number | null;
        }>;
        const name = props["部位名"]?.title?.[0]?.plain_text ?? "";
        const lastDate = props["最終実施日"]?.date?.start ?? null;
        const recoveryHours = props["回復目安時間"]?.number ?? 48;
        const elapsedHours = lastDate
          ? (now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60)
          : Infinity;
        return { id: page.id, name, lastDate, recoveryHours, elapsedHours };
      })
      .filter((bp) => bp.name !== "");

    const neverTrained = bodyParts.filter((bp) => bp.elapsedHours === Infinity);
    let selectedPart: BodyPartRecord;
    let reason: string;

    if (neverTrained.length > 0) {
      selectedPart = neverTrained[0];
      reason = "まだトレーニング記録がありません";
    } else {
      const recovered = bodyParts.filter((bp) => bp.elapsedHours >= bp.recoveryHours);
      const candidates = recovered.length > 0 ? recovered : bodyParts;
      selectedPart = candidates.reduce((a, b) => (a.elapsedHours > b.elapsedHours ? a : b));
      const days = Math.floor(selectedPart.elapsedHours / 24);
      const hours = Math.floor(selectedPart.elapsedHours % 24);
      reason = days > 0 ? `前回から${days}日${hours > 0 ? hours + "時間" : ""}経過しています` : `前回から${Math.floor(selectedPart.elapsedHours)}時間経過しています`;
    }

    const exRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_EXERCISE_DS!,
    });

    const exercises = exRes.results
      .filter((p): p is PageObjectResponse => p.object === "page" && "properties" in p)
      .filter((page) => {
        const props = page.properties as Record<string, { select?: { name: string } | null }>;
        return props["部位"]?.select?.name === selectedPart.name;
      })
      .map((page) => {
        const props = page.properties as Record<string, {
          title?: Array<{ plain_text: string }>;
          number?: number | null;
          select?: { name: string } | null;
        }>;
        return {
          id: page.id,
          種目名: props["種目名"]?.title?.[0]?.plain_text ?? "",
          目標重量kg: props["目標重量kg"]?.number ?? 0,
          目標レップ数: props["目標レップ数"]?.number ?? 0,
          セット数: props["セット数"]?.number ?? 3,
        };
      });

    const elapsedDays = selectedPart.elapsedHours === Infinity
      ? 0
      : Math.floor(selectedPart.elapsedHours / 24);

    return NextResponse.json({
      部位: selectedPart.name,
      理由: reason,
      経過日数: elapsedDays,
      種目リスト: exercises,
    });
  } catch (error) {
    console.error("Recommend error:", error);
    return NextResponse.json({ error: "推薦の取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
