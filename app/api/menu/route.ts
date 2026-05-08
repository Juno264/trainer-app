import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function GET(request: NextRequest) {
  const day = request.nextUrl.searchParams.get("day");
  if (!day) {
    return NextResponse.json({ error: "dayパラメータが必要です" }, { status: 400 });
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: process.env.NOTION_NEXT_MENU_DB!,
      filter: {
        property: "Day",
        select: { equals: day },
      },
      sorts: [{ property: "セット順", direction: "ascending" }],
    });

    const items = response.results
      .filter((p): p is PageObjectResponse => p.object === "page" && "properties" in p)
      .map((page) => {
        const props = page.properties as Record<string, {
          type: string;
          title?: Array<{ plain_text: string }>;
          number?: number | null;
          select?: { name: string } | null;
          rich_text?: Array<{ plain_text: string }>;
          date?: { start: string } | null;
        }>;

        return {
          id: page.id,
          name: props["種目名"]?.title?.[0]?.plain_text ?? "",
          setOrder: props["セット順"]?.number ?? 0,
          targetWeight: props["目標重量kg"]?.number ?? 0,
          targetReps: props["目標レップ数"]?.number ?? 0,
        };
      });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Notion API error:", error);
    return NextResponse.json(
      { error: "メニューの取得に失敗しました" },
      { status: 500 }
    );
  }
}
