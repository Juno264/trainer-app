export type Condition = "良好" | "普通" | "疲れ気味";
export type Rating = "好調" | "普通" | "要注意";
export type WeightChange = "重量UP" | "維持" | "重量DOWN";
export type PartStatus = "未実施" | "疲労中" | "回復済み" | "久しぶり";

export type BodyPartInfo = {
  名前: string;
  経過日数: number;
  回復目安日数: number;
  回復進捗: number;
  状態: PartStatus;
  おすすめ: boolean;
};

export type ExercisePlan = {
  id: string;
  種目名: string;
  部位: string;
  目標重量kg: number;
  目標レップ数: number;
  セット数: number;
  前回重量kg: number | null;
  前回レップ数: number | null;
};

export type RecommendData = {
  部位リスト: BodyPartInfo[];
};

export type SetInput = {
  重量kg: number | "";
  レップ数: number | "";
};

export type ExerciseState = {
  plan: ExercisePlan;
  sets: SetInput[];
  rpe: number;
  memo: string;
  expanded: boolean;
};

export type ReviewResult = {
  総合評価: Rating;
  達成率: number;
  前回比: WeightChange;
  レビュー本文: string;
  次回への指示: string;
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
