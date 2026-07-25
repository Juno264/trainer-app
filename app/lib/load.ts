import type { LoadType } from "./types";

/**
 * 重量の意味は種目の負荷タイプで変わる。
 *
 * external（バーベル/マシン）
 *   weight_kg = そのまま実効負荷
 *
 * bodyweight（自重ベース）
 *   実効負荷 = 体重 + weight_kg
 *   weight_kg < 0 … アシスト（-40 なら 40kg のアシスト）
 *   weight_kg = 0 … 純自重
 *   weight_kg > 0 … 加重（ディップス+10kg など）
 *
 * アシストを正の数で持つと、アシストが減る＝成長したときに
 * グラフが右肩下がりになってしまうため、必ず負で保持する。
 */

export const DEFAULT_BODY_WEIGHT = 70;

/** 実際に body に掛かっている負荷（kg）。推定1RMやボリュームの計算に使う */
export function effectiveLoad(
  weightKg: number,
  loadType: LoadType,
  bodyWeightKg: number
): number {
  if (loadType === "bodyweight") return Math.max(0, bodyWeightKg + weightKg);
  return Math.max(0, weightKg);
}

/** 実効負荷から、入力欄に入れるべき生の重量に戻す（ウォームアップ生成用） */
export function rawFromEffective(
  effective: number,
  loadType: LoadType,
  bodyWeightKg: number
): number {
  if (loadType === "bodyweight") return effective - bodyWeightKg;
  return effective;
}

/**
 * 画面表示用の文字列。
 *   external:   40kg / 自重（0のとき）
 *   bodyweight: 自重 / アシスト40kg / 自重+10kg
 */
export function formatWeight(weightKg: number, loadType: LoadType): string {
  if (loadType === "bodyweight") {
    if (weightKg < 0) return `アシスト${Math.abs(weightKg)}kg`;
    if (weightKg > 0) return `自重+${weightKg}kg`;
    return "自重";
  }
  return weightKg > 0 ? `${weightKg}kg` : "自重";
}

/** 入力欄など、幅の狭い場所向けの短い表記 */
export function formatWeightShort(weightKg: number, loadType: LoadType): string {
  if (loadType === "bodyweight") {
    if (weightKg < 0) return `-${Math.abs(weightKg)}`;
    if (weightKg > 0) return `+${weightKg}`;
    return "自重";
  }
  return weightKg > 0 ? String(weightKg) : "自重";
}

/** 推定1RM（Epley式）。実効負荷ベースで計算するため自重種目でも算出できる */
export function estimate1RM(
  weightKg: number,
  reps: number,
  loadType: LoadType,
  bodyWeightKg: number
): number {
  if (reps <= 0) return 0;
  const load = effectiveLoad(weightKg, loadType, bodyWeightKg);
  if (load <= 0) return 0;
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}
