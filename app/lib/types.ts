export type BodyPart = "胸・三頭" | "背中・二頭" | "脚・お尻" | "肩・腕" | "有酸素（プール）";
export type Condition = "良好" | "普通" | "疲れ気味";
export type Rating = "好調" | "普通" | "要注意";
export type WeightChange = "重量UP" | "維持" | "重量DOWN";

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
  部位: string;
  理由: string;
  経過日数: number;
  種目リスト: ExercisePlan[];
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

export type HistoryReview = {
  総合評価: Rating;
  達成率: number;
  前回比: WeightChange;
  レビュー本文: string;
  次回への指示: string;
};

export type HistorySession = {
  date: string;
  部位: string;
  exercises: HistoryExercise[];
  review: HistoryReview | null;
};
