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

type Tier = "core" | "bonus" | "hold";

// 達成率はコード側で確定的に算出するため、Claudeには生成させない
type ClaudeReview = {
  総合評価: "好調" | "普通" | "要注意";
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

  // ── 0. 種目マスタ（tier / 予定セット数）を取得 ──────────────────────────
  // tier はAI側が状況に応じて更新するため、必ずDBから読む（ハードコード禁止）
  const { data: exMeta, error: exMetaErr } = await supabase
    .from("exercises")
    .select("name, tier, default_sets")
    .eq("body_part", 部位);
  if (exMetaErr) {
    // ここで落ちると達成率が0%になってしまうため、原因が追えるよう明示的に記録する
    console.error("Failed to fetch exercise meta (tier/default_sets):", exMetaErr);
  }

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
  const TIER_LABEL: Record<Tier, string> = { core: "必須", bonus: "任意(ボーナス)", hold: "保留" };
  let totalVolume = 0;
  const sessionLines = records.map((r, order) => {
    const tier = tierOf(r.種目名);
    if (!wasPerformed(r)) {
      return `【${order + 1}種目目: ${r.種目名}】[${TIER_LABEL[tier]}] 未実施（記録なし）`;
    }
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
3. 種目の実施順を見る。後半の種目で未達なら「疲労の影響」と判断し、重量を下げる指示は安易に出さない。
4. 過去4週のトレンドを見る。3週連続で未達なら目標値が高すぎるサインなので、目標を下げることを提案する。逆に余裕で達成が続くなら重量UPを促す。
5. 前回までの自分の指示（あれば）との一貫性を持たせる。前回言ったことが実行できていれば褒める。
6. 改善点は1つに絞る。あれもこれも言わない。実行可能な具体的アクションだけ提示する。
7. ネガティブな指摘で終わらせない。励ましとして「次回はこうすれば伸びる」で締める。
8. 任意(bonus)種目が未実施でも責めない。あくまで余力があればやるもの。実施できていたら加点として褒める。

【次回目標値の調整ルール】
- 全セット達成 & RPE7以下 → 次回 +2.5kg（自重種目はレップ+1）
- 全セット達成 & RPE8〜9 → 維持（フォーム定着フェーズ）
- 後半種目での未達や疲労明らか → 維持（疲労が原因なら重量は据え置く）
- 3週連続で未達が続く種目 → 目標を1段階下げる（高すぎる）
- 自重種目(目標重量0kg)は目標重量kgを0のまま。レップ数は1未満にしない。
- **「未実施（記録なし）」の種目は目標値を絶対に変更しない。** 実施していない以上、
  重量を上下させる根拠が存在しないため。この種目は「種目別次回目標」から除外すること。

以下のJSON形式のみで回答してください（コードブロックや説明文を付けない）:
{
  "総合評価": "好調|普通|要注意",
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
    前回比: "維持",
    レビュー本文: "レビューの生成に失敗しました。お疲れさまでした、記録は保存されています。",
    次回への指示: "前回と同じ内容で続けてください。",
    良かった点: [],
    重点ポイント: "",
    次回アクション: [],
    メモ反映: "",
    長期トレンド: "",
    // AI分析が失敗したときは目標値を一切動かさない（誤調整を防ぐ）
    種目別次回目標: [],
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
      next_instruction: claudeResult.次回への指示,
      weight_adjustment_memo: claudeResult.種目別次回目標
        .map((e) => `${e.種目名}: ${e.調整理由}`)
        .join(", "),
      review_json,
    },
    { onConflict: "body_part,trained_at" }
  );
  if (reviewErr) console.error("Failed to save review:", reviewErr);

  // 5. 種目マスタの目標値を更新
  //
  // 【重要】自動調整は「実際に実施した core 種目」に限る。
  // 記録がない種目まで調整対象にしていたため、実施していない種目の目標重量が
  // セッションのたびに下がり続ける不具合があった（脚・お尻が57.5kgまで低下）。
  // 「記録がない」と「実施したが未達」は別の事象で、前者はシグナルが存在しない。
  const adjustable = new Set(
    records
      .filter(wasPerformed)                       // 全0rep・空入力は記録なしと同等
      .filter((r) => tierOf(r.種目名) === "core") // bonus は未達が仕様上ありうる / hold は対象外
      .map((r) => r.種目名)
  );

  const skipped = claudeResult.種目別次回目標
    .filter((t) => !adjustable.has(t.種目名))
    .map((t) => t.種目名);
  if (skipped.length > 0) {
    console.log("目標値の自動調整をスキップ（未実施 or core以外）:", skipped.join(", "));
  }

  await Promise.all(
    claudeResult.種目別次回目標.map(async (target) => {
      if (!adjustable.has(target.種目名)) return;
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
    達成率: coreRate,
    achievement,
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
