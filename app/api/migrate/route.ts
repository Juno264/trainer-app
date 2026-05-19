import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { supabase } from "../../lib/supabase";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const PART_MAP: Record<string, string> = {
  "胸・三頭": "胸・肩・三頭",
  "肩・腕": "胸・肩・三頭",
};

type PropMap = Record<string, {
  title?: Array<{ plain_text: string }>;
  number?: number | null;
  date?: { start: string } | null;
  select?: { name: string } | null;
  rich_text?: Array<{ plain_text: string }>;
}>;

export async function GET() {
  const results: { step: string; count?: number; error?: string }[] = [];

  // 1. トレーニング記録をNotionから取得してSupabaseに挿入
  try {
    const recordRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_RECORD_DS!,
    });

    const rows: object[] = [];
    for (const page of recordRes.results) {
      if (page.object !== "page" || !("properties" in page)) continue;
      const props = (page as PageObjectResponse).properties as PropMap;
      const exercise_name = props["種目名"]?.title?.[0]?.plain_text ?? "";
      const trained_at = props["実施日"]?.date?.start ?? "";
      const raw部位 = props["部位"]?.select?.name ?? "";
      const body_part = PART_MAP[raw部位] ?? raw部位;
      const weight_kg = props["重量kg"]?.number ?? 0;
      const reps = props["レップ数"]?.number ?? 0;
      const set_num = props["セット数"]?.number ?? 0;
      const target_weight_kg = props["目標重量kg"]?.number ?? 0;
      const target_reps = props["目標レップ数"]?.number ?? 0;
      const achieved = props["達成"]?.select?.name === "達成";
      const rpe = props["RPE"]?.number ?? 0;
      const condition = props["体調"]?.select?.name ?? "普通";
      const memo = props["メモ"]?.rich_text?.[0]?.plain_text ?? "";
      if (!exercise_name || !trained_at || !body_part || !set_num) continue;
      rows.push({ exercise_name, body_part, trained_at, set_num, weight_kg, reps, target_weight_kg, target_reps, achieved, rpe, condition, memo });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("training_records")
        .upsert(rows, { onConflict: "exercise_name,trained_at,set_num", ignoreDuplicates: true });
      if (error) throw error;
    }
    results.push({ step: "training_records", count: rows.length });
  } catch (e) {
    results.push({ step: "training_records", error: String(e) });
  }

  // 2. レビューをNotionから取得してSupabaseに挿入
  try {
    const reviewRes = await notion.dataSources.query({
      data_source_id: process.env.NOTION_REVIEW_DS!,
    });

    const rows: object[] = [];
    for (const page of reviewRes.results) {
      if (page.object !== "page" || !("properties" in page)) continue;
      const props = (page as PageObjectResponse).properties as PropMap;
      const trained_at = props["実施日"]?.date?.start ?? "";
      const body_part = props["部位"]?.select?.name ?? "";
      const overall_rating = props["総合評価"]?.select?.name ?? "普通";
      const achievement_rate = props["達成率"]?.number ?? 0;
      const weight_change = props["前回比"]?.select?.name ?? "維持";
      const review_text = props["レビュー本文"]?.rich_text?.[0]?.plain_text ?? "";
      const next_instruction = props["次回への指示"]?.rich_text?.[0]?.plain_text ?? "";
      if (!trained_at || !body_part) continue;
      rows.push({ body_part, trained_at, overall_rating, achievement_rate, weight_change, review_text, next_instruction });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("reviews")
        .upsert(rows, { onConflict: "body_part,trained_at", ignoreDuplicates: true });
      if (error) throw error;
    }
    results.push({ step: "reviews", count: rows.length });
  } catch (e) {
    results.push({ step: "reviews", error: String(e) });
  }

  return NextResponse.json({ success: true, results });
}
