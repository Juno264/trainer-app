import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const CARDIO = "有酸素（プール）";
const JISABURI_HOURS = 120; // 5日

type PartStatus = "未実施" | "疲労中" | "回復済み" | "久しぶり";

export async function GET() {
  try {
    const buiRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_BUIMASTER_DS!,
    });

    const now = new Date();

    const bodyParts = buiRes.results
      .filter((p): p is PageObjectResponse => p.object === "page" && "properties" in p)
      .map((page) => {
        const props = page.properties as Record<string, {
          title?: Array<{ plain_text: string }>;
          date?: { start: string } | null;
          number?: number | null;
        }>;
        const 名前 = props["部位名"]?.title?.[0]?.plain_text ?? "";
        const lastDate = props["最終実施日"]?.date?.start ?? null;
        const recoveryHours = props["回復目安時間"]?.number ?? 48;
        const elapsedHours = lastDate
          ? (now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60)
          : Infinity;

        let 状態: PartStatus;
        if (elapsedHours === Infinity) 状態 = "未実施";
        else if (elapsedHours < recoveryHours) 状態 = "疲労中";
        else if (elapsedHours >= JISABURI_HOURS) 状態 = "久しぶり";
        else 状態 = "回復済み";

        // 回復進捗: 疲労中は0〜1、それ以外は1.0以上（久しぶりは1.5固定）
        const 回復進捗 = elapsedHours === Infinity ? 1.5
          : 状態 === "久しぶり" ? 1.5
          : Math.min(1.5, elapsedHours / recoveryHours);

        return {
          名前,
          経過日数: elapsedHours === Infinity ? 0 : Math.floor(elapsedHours / 24),
          回復目安日数: Math.round(recoveryHours / 24),
          回復進捗,
          状態,
          おすすめ: false,
          _sortKey: elapsedHours === Infinity ? Infinity : elapsedHours / recoveryHours,
          _疲労中: 状態 === "疲労中",
        };
      })
      .filter((bp) => bp.名前 !== "" && bp.名前 !== CARDIO && !bp.名前.startsWith("_"));

    // 疲労中を末尾に、それ以外は elapsed/recovery 比が高い順
    bodyParts.sort((a, b) => {
      if (a._疲労中 !== b._疲労中) return a._疲労中 ? 1 : -1;
      return b._sortKey - a._sortKey;
    });

    if (bodyParts.length > 0) bodyParts[0].おすすめ = true;

    const result = bodyParts.map(({ _sortKey: _s, _疲労中: _f, ...bp }) => bp);

    return NextResponse.json({ 部位リスト: result });
  } catch (error) {
    console.error("Recommend error:", error);
    return NextResponse.json({ error: "取得に失敗しました", detail: String(error) }, { status: 500 });
  }
}
