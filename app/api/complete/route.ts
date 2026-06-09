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

type NextAction = { アクション: string; 理由: string };

type ClaudeReview = {
  総合評価: "好調" | "普通" | "要注意";
  達成率: number;
  前回比: "重量UP" | "維持" | "重量DOWN";
  レビュー本文: string;
  次回への指示: string;
  良かった点: string[];
  重点ポイント: string;
  次回アクション: NextAction[];
  メモ反映: string;
  長期トレンド: string;
  種目別次回目標: ClaudeTarget[];
};

const fmtW = (w: number) => (w > 0 ? `${w}kg` : "自重");

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

  // 2. 過去4週の履歴 + 直近レビューを取得してトレーナー視点の文脈を作る
  let 履歴文脈 = "";
  let 直近レビュー文脈 = "";
  const prevBests: Record<string, { weight_kg: number; reps: number }> = {};
  try {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [{ data: histRecords }, { data: pastReviews }] = await Promise.all([
      supabase
        .from("training_records")
        .select("exercise_name, weight_kg, reps, target_weight_kg, target_reps, achieved, rpe, set_num, trained_at, memo")
        .eq("body_part", 部位)
        .gte("trained_at", fourWeeksAgo)
        .lt("trained_at", today)
        .order("trained_at", { ascending: false })
        .order("set_num", { ascending: true }),
      supabase
        .from("reviews")
        .select("trained_at, overall_rating, achievement_rate, next_instruction")
        .eq("body_part", 部位)
        .lt("trained_at", today)
        .order("trained_at", { ascending: false })
        .limit(4),
    ]);

    // 種目ごとの自己ベスト（前回比判定の補助）
    for (const r of histRecords ?? []) {
      if (!prevBests[r.exercise_name] || r.weight_kg > prevBests[r.exercise_name].weight_kg) {
        prevBests[r.exercise_name] = { weight_kg: r.weight_kg, reps: r.reps };
      }
    }

    // 日付ごとにセッションをまとめる（種目別の最高セットと達成率）
    type DaySession = Record<string, { best: string; achieved: number; total: number; rpe: number }>;
    const byDate: Record<string, DaySession> = {};
    for (const r of histRecords ?? []) {
      const d = r.trained_at as string;
      byDate[d] = byDate[d] ?? {};
      const ex = (byDate[d][r.exercise_name] = byDate[d][r.exercise_name] ?? {
        best: "",
        achieved: 0,
        total: 0,
        rpe: r.rpe,
      });
      ex.total += 1;
      if (r.achieved) ex.achieved += 1;
      const cur = `${fmtW(r.weight_kg)}×${r.reps}`;
      if (!ex.best) ex.best = cur;
    }

    const dateLines = Object.entries(byDate)
      .slice(0, 6)
      .map(([d, exs]) => {
        const exLine = Object.entries(exs)
          .map(([n, v]) => `${n} ${v.best}(${v.achieved}/${v.total}達成,RPE${v.rpe})`)
          .join(" / ");
        return `${d}: ${exLine}`;
      });
    履歴文脈 = dateLines.length
      ? `\n\n【過去4週のセッション（新しい順）】\n${dateLines.join("\n")}`
      : "\n\n【過去4週のセッション】まだ履歴がありません（この部位は初回に近い）";

    if (pastReviews && pastReviews.length) {
      直近レビュー文脈 =
        "\n\n【前回までのあなた（トレーナー）の指示】\n" +
        pastReviews
          .map((rv) => `${rv.trained_at}(達成率${rv.achievement_rate}%): ${rv.next_instruction}`)
          .join("\n");
    }
  } catch (e) {
    console.error("Failed to fetch history context:", e);
  }

  // 3. 今回セッションの詳細（種目の実施順・セット内訳・メモ・RPE・総ボリューム）
  let totalVolume = 0;
  const sessionLines = records.map((r, order) => {
    const setDetails = r.sets
      .map((s, i) => {
        totalVolume += (s.重量kg > 0 ? s.重量kg : 1) * s.レップ数;
        return `  Set${i + 1}: ${fmtW(s.重量kg)}×${s.レップ数}rep (目標${fmtW(s.目標重量kg)}×${s.目標レップ数}rep, ${s.達成 ? "達成" : "未達"})`;
      })
      .join("\n");
    const achievedCount = r.sets.filter((s) => s.達成).length;
    const prev = prevBests[r.種目名];
    const prevLine = prev ? ` / 自己ベスト${fmtW(prev.weight_kg)}×${prev.reps}` : " / 初回種目";
    const memoLine = r.メモ?.trim() ? `\n  メモ: 「${r.メモ.trim()}」` : "";
    return `【${order + 1}種目目: ${r.種目名}】${prevLine}\n${setDetails}\n  達成 ${achievedCount}/${r.sets.length}セット, RPE${r.RPE}${memoLine}`;
  });

  const userPrompt = `あなたは私の専属パーソナルトレーナーです。今日のトレーニングを終えた私に、対面で声をかけるようにフィードバックしてください。

【今日のセッション】${today} / 部位:${部位} / 体調:${体調}
種目は上から実施した順番です。後半の種目ほど疲労が蓄積している点を考慮してください。
セッション総ボリューム(重量×回数の合計): 約${Math.round(totalVolume)}

${sessionLines.join("\n\n")}${履歴文脈}${直近レビュー文脈}

【分析方針 — 必ず守ること】
1. まず「今日できたこと」を具体的に挙げて認める。数値で達成できた部分を見つける。
2. メモがある種目は、メモの内容を必ず分析に反映する（例:「フォームが甘い」なら疲労・集中・時間のどれが原因か推測して言及）。
3. 種目の実施順を見る。後半の種目で未達なら「疲労の影響」と判断し、重量を下げる指示は安易に出さない。
4. 過去4週のトレンドを見る。3週連続で未達なら目標値が高すぎるサインなので、目標を下げることを提案する。逆に余裕で達成が続くなら重量UPを促す。
5. 前回までの自分の指示（あれば）との一貫性を持たせる。前回言ったことが実行できていれば褒める。
6. 改善点は1つに絞る。あれもこれも言わない。実行可能な具体的アクションだけ提示する。
7. ネガティブな指摘で終わらせない。励ましとして「次回はこうすれば伸びる」で締める。

【次回目標値の調整ルール】
- 全セット達成 & RPE7以下 → 次回 +2.5kg（自重種目はレップ+1）
- 全セット達成 & RPE8〜9 → 維持（フォーム定着フェーズ）
- 後半種目での未達や疲労明らか → 維持（疲労が原因なら重量は据え置く）
- 3週連続で未達が続く種目 → 目標を1段階下げる（高すぎる）
- 自重種目(目標重量0kg)は目標重量kgを0のまま。レップ数は1未満にしない。

以下のJSON形式のみで回答してください（コードブロックや説明文を付けない）:
{
  "総合評価": "好調|普通|要注意",
  "達成率": 0-100の整数,
  "前回比": "重量UP|維持|重量DOWN",
  "良かった点": ["今日実際にできた具体的な事を2〜3個"],
  "重点ポイント": "次回向けに絞った1つの改善テーマ",
  "次回アクション": [{"アクション": "実行可能な具体策", "理由": "なぜそれをやるのか"}],
  "メモ反映": "メモの内容をどう解釈し分析に活かしたか（メモが無ければ空文字）",
  "長期トレンド": "過去4週の推移から見た現状一言（プラトー/順調/要調整など）",
  "レビュー本文": "対面で話すような温かいレビュー(200文字以内、良かった点→背景→励まし)",
  "次回への指示": "次回最初に意識する一言(80文字以内)",
  "種目別次回目標": [{"種目名": "種目名", "目標重量kg": 数値, "目標レップ数": 数値, "調整理由": "なぜその重量か"}]
}`;

  const fallback: ClaudeReview = {
    総合評価: "普通",
    達成率: 0,
    前回比: "維持",
    レビュー本文: "レビューの生成に失敗しました。お疲れさまでした、記録は保存されています。",
    次回への指示: "前回と同じ内容で続けてください。",
    良かった点: [],
    重点ポイント: "",
    次回アクション: [],
    メモ反映: "",
    長期トレンド: "",
    種目別次回目標: records.map((r) => ({
      種目名: r.種目名,
      目標重量kg: r.sets[0]?.目標重量kg ?? 0,
      目標レップ数: r.sets[0]?.目標レップ数 ?? 0,
      調整理由: "AI分析エラー",
    })),
  };

  let claudeResult: ClaudeReview = fallback;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3072,
      system: `あなたは経験豊富で人間味のあるパーソナルトレーナーです。クライアントのモチベーションを最優先に、肯定から入り、具体的で実行可能な助言をします。単なる目標値と実績の数値比較ではなく、メモ・疲労・種目順・長期トレンドを総合して人間のトレーナーのように語ってください。返答は日本語、指定されたJSON形式のみ。`,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Partial<ClaudeReview>;
      claudeResult = {
        ...fallback,
        ...parsed,
        良かった点: parsed.良かった点 ?? [],
        次回アクション: parsed.次回アクション ?? [],
        種目別次回目標: parsed.種目別次回目標 ?? fallback.種目別次回目標,
      };
    }
  } catch (e) {
    console.error("Claude error:", e);
  }

  // 4. レビューをSupabaseに保存（構造化レビューは review_json に）
  const review_json = {
    良かった点: claudeResult.良かった点,
    重点ポイント: claudeResult.重点ポイント,
    次回アクション: claudeResult.次回アクション,
    メモ反映: claudeResult.メモ反映,
    長期トレンド: claudeResult.長期トレンド,
  };
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
      review_json,
    },
    { onConflict: "body_part,trained_at" }
  );
  if (reviewErr) console.error("Failed to save review:", reviewErr);

  // 5. 種目マスタの目標値を更新（自重種目のレップ下限を保証）
  await Promise.all(
    claudeResult.種目別次回目標.map(async (target) => {
      const exercise = records.find((r) => r.種目名 === target.種目名);
      if (!exercise?.id) return;
      const isBodyweight = (exercise.sets[0]?.目標重量kg ?? 0) === 0;
      const safeReps = isBodyweight ? Math.max(1, target.目標レップ数) : target.目標レップ数;
      const safeWeight = isBodyweight ? 0 : Math.max(0, target.目標重量kg);
      const { error } = await supabase
        .from("exercises")
        .update({
          target_weight_kg: safeWeight,
          target_reps: safeReps,
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
    良かった点: claudeResult.良かった点,
    重点ポイント: claudeResult.重点ポイント,
    次回アクション: claudeResult.次回アクション,
    メモ反映: claudeResult.メモ反映,
    長期トレンド: claudeResult.長期トレンド,
  });
}
