export type Condition = "良好" | "普通" | "疲れ気味";
export type Rating = "好調" | "普通" | "要注意";
export type WeightChange = "重量UP" | "維持" | "重量DOWN";
export type PartStatus = "未実施" | "疲労中" | "回復済み" | "そろそろ" | "久しぶり";

export type BodyPartInfo = {
  名前: string;
  経過日数: number;
  回復目安日数: number;
  回復進捗: number;
  状態: PartStatus;
  おすすめ: boolean;
};

export type PrevSet = {
  重量kg: number;
  レップ数: number;
};

/**
 * 種目の区分。DBの exercises.tier に対応する。
 * core  … 必須種目。達成率の分母に含む
 * bonus … 任意種目。分母にも分子にも含めず、加点として別カウント
 * hold  … 保留中。トレーニング画面に出さず、集計対象外
 * 状況に応じてAI側が更新するため、ハードコードせず必ずDBから読むこと。
 */
export type Tier = "core" | "bonus" | "hold";

/**
 * 負荷のかかり方。重量kgの意味がこれで変わる。
 * external   … バーベル/マシン。実効負荷 = 重量
 * bodyweight … 自重ベース。実効負荷 = 体重 + 重量（負ならアシスト）
 */
export type LoadType = "external" | "bodyweight";

export type ExercisePlan = {
  id: string;
  種目名: string;
  部位: string;
  目標重量kg: number;
  目標レップ数: number;
  セット数: number;
  ウォームアップセット数: number;
  tier: Tier;
  負荷タイプ: LoadType;
  /** ユーザー向けの実施指示（フォーム・器具の制約・中止条件）。null なら非表示 */
  指示: string | null;
  前回セット: PrevSet[];
};

export type RecommendData = {
  部位リスト: BodyPartInfo[];
};

export type SetInput = {
  重量kg: number | "";
  レップ数: number | "";
  ウォームアップ?: boolean;
};

export type ExerciseState = {
  plan: ExercisePlan;
  sets: SetInput[];
  rpe: number;
  memo: string;
  expanded: boolean;
};

export type NextAction = {
  アクション: string;
  理由: string;
};

/** 達成率の内訳。core のみで算出し、bonus は加点として別掲する */
export type AchievementBreakdown = {
  core_rate: number;
  core_done: number;
  core_planned: number;
  bonus_done: number;
};

export type ReviewResult = {
  総合評価: Rating;
  達成率: number;
  前回比: WeightChange;
  レビュー本文: string;
  次回への指示: string;
  achievement?: AchievementBreakdown;
  // ── 構造化レビュー（トレーナー視点AI分析）──
  良かった点?: string[];
  重点ポイント?: string;
  次回アクション?: NextAction[];
  メモ反映?: string;
  長期トレンド?: string;
};

export type HistoryReview = ReviewResult;

export type HistorySet = {
  重量kg: number;
  レップ数: number;
  達成: boolean;
};

export type HistoryExercise = {
  種目名: string;
  sets: HistorySet[];
  rpe: number;
};

export type HistorySession = {
  date: string;
  部位: string;
  exercises: HistoryExercise[];
  review: HistoryReview | null;
};

export type StatsPoint = {
  date: string;
  weight_kg: number;
  reps: number;
  /** 実効負荷（自重種目は体重を加味した値）ベースの推定1RM */
  e1rm: number;
};

export type AppSettings = {
  体重kg: number;
};

/**
 * program_plan から引いた「今日の予定」。
 * 部位が null の日は筋トレ休養日（有酸素分 を案内する）。
 * あくまで予定であり、実施可否の安全装置は body_parts.recovery_hours 側が持つ。
 */
export type TodayPlan = {
  日付: string;
  フェーズ: string;
  部位: string | null;
  有酸素分: number | null;
  メモ: string | null;
};

export type WeeklySummary = {
  summary: string;
  period: { from: string; to: string };
  sessionCount: number;
};
