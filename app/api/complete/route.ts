import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";
import { effectiveLoad, formatWeight, DEFAULT_BODY_WEIGHT } from "../../lib/load";
import type { LoadType } from "../../lib/types";
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

type NextAction = { アクション: string; 理由: string };

type Tier = "core" | "bonus" | "hold";

/**
 * 自動レビューの守備範囲は「今日の記録の要約」まで。
 * 達成率はコード側で確定的に算出するため生成させない。
 * 次回の重量・レップ数の処方（次回への指示 / 種目別次回目標）も生成させない —
 * その判断は外部AI分析に一本化した。
 */
type ClaudeReview = {
  総合評価: "好調" | "普通" | "要注意";
  前回比: "重量UP" | "維持" | "重量DOWN";
  レビュー本文: string;
  良かった点: string[];
  重点ポイント: string;
  次回アクション: NextAction[];
  メモ反映: string;
  長期トレンド: string;
};

/** 種目の負荷タイプを考慮した重量表記。アシストは「アシスト40kg」と出す */
const makeFmtW = (loadTypeOf: (name: string) => LoadType) =>
  (w: number, exerciseName: string) => formatWeight(w, loadTypeOf(exerciseName));

export async function POST(request: NextRequest) {
  const body: CompleteBody = await request.json();
  const { 部位, 実施日, records } = body;
  const today = 実施日 || new Date().toISOString().split("T")[0];
  const 体調 = records[0]?.体調 ?? "普通";

  // ── 0. 種目マスタ（tier / 予定セット数）を取得 ──────────────────────────
  // tier はAI側が状況に応じて更新するため、必ずDBから読む（ハードコード禁止）
  const [{ data: exMeta, error: exMetaErr }, { data: bwSetting }] = await Promise.all([
    supabase
      .from("exercises")
      .select("name, tier, default_sets, load_type")
      .eq("body_part", 部位),
    supabase.from("app_settings").select("value").eq("key", "body_weight_kg").maybeSingle(),
  ]);
  if (exMetaErr) {
    // ここで落ちると達成率が0%になってしまうため、原因が追えるよう明示的に記録する
    console.error("Failed to fetch exercise meta (tier/default_sets):", exMetaErr);
  }
  const parsedBw = Number(bwSetting?.value);
  const bodyWeight = Number.isFinite(parsedBw) && parsedBw > 0 ? parsedBw : DEFAULT_BODY_WEIGHT;

  const loadTypeOf = (name: string): LoadType =>
    ((exMeta ?? []).find((e) => e.name === name)?.load_type ?? "external") as LoadType;
  const fmtW = makeFmtW(loadTypeOf);

  const tierOf = (name: string): Tier =>
    ((exMeta ?? []).find((e) => e.name === name)?.tier ?? "core") as Tier;
  const plannedOf = (name: string): number =>
    (exMeta ?? []).find((e) => e.name === name)?.default_sets ?? 0;

  // 「実施した」＝1レップ以上の記録が存在すること。
  // 種目を開いただけ（全0rep）は記録なしと同等に扱う。
  const wasPerformed = (r: ExerciseRecord) => r.sets.some((s) => s.レップ数 > 0);

  // ── 1. トレーニング記録をSupabaseに書き込む（未実施種目は保存しない）────
  const recordRows = records.filter(wasPerformed).flatMap((record) =>
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

  if (recordRows.length > 0) {
    const { error: insertErr } = await supabase
      .from("training_records")
      .upsert(recordRows, { onConflict: "exercise_name,trained_at,set_num", ignoreDuplicates: true });
    if (insertErr) console.error("Failed to insert records:", insertErr);
  }

  // ── 1.5 達成率を確定的に算出する ────────────────────────────────────────
  // 分母は core 種目の「予定セット数(default_sets)」の合計。実記録数ではないため、
  // 種目を丸ごと飛ばしても正しく未達として反映される。
  // bonus は分母にも分子にも入れず加点として別カウント。hold は完全に集計対象外。
  const corePlanned = (exMeta ?? [])
    .filter((e) => (e.tier ?? "core") === "core")
    .reduce((sum, e) => sum + (e.default_sets ?? 0), 0);

  let coreDone = 0;
  let bonusDone = 0;
  for (const r of records) {
    const achieved = r.sets.filter((s) => s.達成).length;
    if (achieved === 0) continue;
    const tier = tierOf(r.種目名);
    if (tier === "core") {
      // 予定を超えて実施した分は加算しない（上限100%を保証）
      coreDone += Math.min(achieved, plannedOf(r.種目名) || achieved);
    } else if (tier === "bonus") {
      bonusDone += achieved;
    }
    // hold は集計しない
  }

  const coreRate = corePlanned > 0
    ? Math.max(0, Math.min(100, Math.round((coreDone / corePlanned) * 100)))
    : 0;

  const achievement = {
    core_rate: coreRate,
    core_done: coreDone,
    core_planned: corePlanned,
    bonus_done: bonusDone,
  };

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
      const cur = `${fmtW(r.weight_kg, r.exercise_name)}×${r.reps}`;
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
  const TIER_LABEL: Record<Tier, string> = { core: "必須", bonus: "任意(ボーナス)", hold: "保留" };
  let totalVolume = 0;
  const sessionLines = records.map((r, order) => {
    const tier = tierOf(r.種目名);
    if (!wasPerformed(r)) {
      return `【${order + 1}種目目: ${r.種目名}】[${TIER_LABEL[tier]}] 未実施（記録なし）`;
    }
    const setDetails = r.sets
      .map((s, i) => {
        totalVolume += effectiveLoad(s.重量kg, loadTypeOf(r.種目名), bodyWeight) * s.レップ数;
        return `  Set${i + 1}: ${fmtW(s.重量kg, r.種目名)}×${s.レップ数}rep (目標${fmtW(s.目標重量kg, r.種目名)}×${s.目標レップ数}rep, ${s.達成 ? "達成" : "未達"})`;
      })
      .join("\n");
    const achievedCount = r.sets.filter((s) => s.達成).length;
    const prev = prevBests[r.種目名];
    const prevLine = prev ? ` / 自己ベスト${fmtW(prev.weight_kg, r.種目名)}×${prev.reps}` : " / 初回種目";
    const memoLine = r.メモ?.trim() ? `\n  メモ: 「${r.メモ.trim()}」` : "";
    return `【${order + 1}種目目: ${r.種目名}】[${TIER_LABEL[tier]}]${prevLine}\n${setDetails}\n  達成 ${achievedCount}/${r.sets.length}セット, RPE${r.RPE}${memoLine}`;
  });

  const 達成率文脈 = `\n\n【達成率（システムが算出済み・変更禁止）】
必須達成率: ${coreRate}%（必須 ${coreDone}/${corePlanned} セット）${bonusDone > 0 ? `\nボーナス達成: +${bonusDone}セット` : ""}
※ 必須(core)種目のみで算出。任意(bonus)は分母・分子に含めず加点扱い。保留(hold)は集計対象外。
※ 未実施の必須種目は「予定セット数ぶん未達」として分母に残っている。`;

  const userPrompt = `あなたは私の専属パーソナルトレーナーです。今日のトレーニングを終えた私に、対面で声をかけるようにフィードバックしてください。

【今日のセッション】${today} / 部位:${部位} / 体調:${体調}
種目は上から実施した順番です。後半の種目ほど疲労が蓄積している点を考慮してください。
セッション総ボリューム(重量×回数の合計): 約${Math.round(totalVolume)}

${sessionLines.join("\n\n")}${達成率文脈}${履歴文脈}${直近レビュー文脈}

【分析方針 — 必ず守ること】
1. まず「今日できたこと」を具体的に挙げて認める。数値で達成できた部分を見つける。
2. メモがある種目は、メモの内容を必ず分析に反映する（例:「フォームが甘い」なら疲労・集中・時間のどれが原因か推測して言及）。
3. 種目の実施順を見る。後半の種目で未達なら、種目そのものの限界ではなく「疲労の影響」と判断する。
4. 過去4週のトレンドを見て、プラトーか順調かの見立てを「長期トレンド」に書く。
5. 前回までの自分の指示（あれば）との一貫性を持たせる。前回言ったことが実行できていれば褒める。
6. 改善点は1つに絞る。あれもこれも言わない。実行可能な具体的アクションだけ提示する。
7. ネガティブな指摘で終わらせない。励ましとして「次回はこうすれば伸びる」で締める。
8. 任意(bonus)種目が未実施でも責めない。あくまで余力があればやるもの。実施できていたら加点として褒める。

【重要 — 絶対に守る制約】
次回の目標重量・レップ数を決めるのは**あなたの仕事ではない**。別のAI分析が担当している。
- 「次回は◯kgにしましょう」のような具体的な数値の処方を書かない。
- 重量やレップ数を上げる/下げるという判断そのものを書かない。
- 書いてよいのは「今日の記録の要約」と「フォーム・意識の持ち方」まで。
理由: メモに書かれた器具の制約（例:「このマシンは13kgと18kgの2択しかない」）を無視した
存在しない重量を指示したり、自己ベストを事故と誤認して巻き戻す事故が実際に起きたため。

【重量表記の読み方（記録を正しく解釈するために必要）】
- 「アシストNkg」＝ 補助を N kg 受けている状態で、内部的には **負の数**（-N）で記録される。
  アシストが減る（-40 → -30）ほど自分の力で挙げていることになり、これが**進歩**。
  数値が増えたように見えても後退ではないので、前回比の判定を誤らないこと。
- 「自重+Nkg」は加重で、こちらは正の数。
- 現在の体重は ${bodyWeight}kg。実効負荷は 体重＋重量kg で計算している。

以下のJSON形式のみで回答してください（コードブロックや説明文を付けない）:
{
  "総合評価": "好調|普通|要注意",
  "前回比": "重量UP|維持|重量DOWN",
  "良かった点": ["今日実際にできた具体的な事を2〜3個"],
  "重点ポイント": "次回向けに絞った1つの改善テーマ（重量の数値には触れない）",
  "次回アクション": [{"アクション": "フォームや意識に関する具体策（重量やレップ数の指示は書かない）", "理由": "なぜそれをやるのか"}],
  "メモ反映": "メモの内容をどう解釈し分析に活かしたか（メモが無ければ空文字）",
  "長期トレンド": "過去4週の推移から見た現状一言（プラトー/順調/要調整など）",
  "レビュー本文": "対面で話すような温かいレビュー(200文字以内、良かった点→背景→励まし)"
}`;

  const fallback: ClaudeReview = {
    総合評価: "普通",
    前回比: "維持",
    レビュー本文: "レビューの生成に失敗しました。お疲れさまでした、記録は保存されています。",
    良かった点: [],
    重点ポイント: "",
    次回アクション: [],
    メモ反映: "",
    長期トレンド: "",
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
      };
    }
  } catch (e) {
    console.error("Claude error:", e);
  }

  // 4. レビューをSupabaseに保存（構造化レビューは review_json に）
  //
  // next_instruction / weight_adjustment_memo は意図的に upsert の対象外にしている。
  // この2列は外部AI分析が重量・レップ数の判断を書き込む先で、アプリが上書きしてはならない。
  // upsert は渡したキーだけを UPDATE するため、省略すれば既存値がそのまま残る。
  const review_json = {
    良かった点: claudeResult.良かった点,
    重点ポイント: claudeResult.重点ポイント,
    次回アクション: claudeResult.次回アクション,
    メモ反映: claudeResult.メモ反映,
    長期トレンド: claudeResult.長期トレンド,
    achievement,
  };
  const { error: reviewErr } = await supabase.from("reviews").upsert(
    {
      body_part: 部位,
      trained_at: today,
      overall_rating: claudeResult.総合評価,
      // 必須(core)達成率のみを保存する。2026-07-25 以前の値は旧ロジックのため直接比較できない
      achievement_rate: coreRate,
      weight_change: claudeResult.前回比,
      review_text: claudeResult.レビュー本文,
      review_json,
    },
    { onConflict: "body_part,trained_at" }
  );
  if (reviewErr) console.error("Failed to save review:", reviewErr);

  // 5. 種目マスタ（target_weight_kg / target_reps）の自動更新は行わない。
  //
  // かつては実施した core 種目に限って自動調整していたが、ガードを足しても
  // 「実現しない重量を指示する」「自己ベストを事故と誤認して巻き戻す」事故が残った。
  // 重量・レップ数を決める判断そのものを外部AI分析に移し、アプリからは書き込まない。
  // 変更は exercises.instruction / reviews.next_instruction 経由で人に伝わる。

  // 6. 部位マスタの最終実施日を更新
  const { error: partErr } = await supabase
    .from("body_parts")
    .update({ last_trained_at: today })
    .eq("name", 部位);
  if (partErr) console.error("Failed to update body_parts:", partErr);

  // 次回への指示は外部AI分析が reviews.next_instruction に書き込む。
  // 既に書き込まれていればそれを表示し、まだなら空文字（画面側で非表示になる）。
  let 次回への指示 = "";
  const { data: savedReview, error: readBackErr } = await supabase
    .from("reviews")
    .select("next_instruction")
    .eq("body_part", 部位)
    .eq("trained_at", today)
    .maybeSingle();
  if (readBackErr) console.error("Failed to read back next_instruction:", readBackErr);
  else 次回への指示 = savedReview?.next_instruction ?? "";

  return NextResponse.json({
    総合評価: claudeResult.総合評価,
    達成率: coreRate,
    achievement,
    前回比: claudeResult.前回比,
    レビュー本文: claudeResult.レビュー本文,
    次回への指示,
    良かった点: claudeResult.良かった点,
    重点ポイント: claudeResult.重点ポイント,
    次回アクション: claudeResult.次回アクション,
    メモ反映: claudeResult.メモ反映,
    長期トレンド: claudeResult.長期トレンド,
  });
}
