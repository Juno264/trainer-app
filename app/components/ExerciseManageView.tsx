"use client";
import { useState, useEffect } from "react";
import type { ExercisePlan, Tier } from "../lib/types";

const BODY_PARTS = ["胸・肩・三頭", "背中・二頭", "脚・お尻"];

const TIERS: { value: Tier; label: string; hint: string }[] = [
  { value: "core", label: "必須", hint: "達成率の分母に含む" },
  { value: "bonus", label: "任意", hint: "余力があれば。加点扱い" },
  { value: "hold", label: "保留", hint: "画面に出さず集計対象外" },
];

type EditState = {
  target_weight_kg: number;
  target_reps: number;
  default_sets: number;
};

export default function ExerciseManageView() {
  const [selectedPart, setSelectedPart] = useState(BODY_PARTS[0]);
  const [byPart, setByPart] = useState<Record<string, ExercisePlan[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ target_weight_kg: 0, target_reps: 10, default_sets: 3 });
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSets, setNewSets] = useState(3);
  const [newWeight, setNewWeight] = useState(0);
  const [newReps, setNewReps] = useState(10);

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setByPart(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const exercises = byPart[selectedPart] ?? [];

  const startEdit = (ex: ExercisePlan) => {
    setEditingId(ex.id);
    setEditState({
      target_weight_kg: ex.目標重量kg,
      target_reps: ex.目標レップ数,
      default_sets: ex.セット数,
    });
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    const res = await fetch(`/api/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_weight_kg: editState.target_weight_kg,
        target_reps: editState.target_reps,
        default_sets: editState.default_sets,
      }),
    });
    if (res.ok) {
      setByPart((prev) => ({
        ...prev,
        [selectedPart]: prev[selectedPart].map((ex) =>
          ex.id === id
            ? { ...ex, 目標重量kg: editState.target_weight_kg, 目標レップ数: editState.target_reps, セット数: editState.default_sets }
            : ex
        ),
      }));
    }
    setSaving(false);
    setEditingId(null);
  };

  // 種目の区分（必須/任意/保留）を切り替える。
  // 保留にした種目はトレーニング画面から消えるが、削除ではないのでここで戻せる。
  const changeTier = async (id: string, tier: Tier) => {
    const prevState = byPart[selectedPart];
    // 楽観的に反映してから保存し、失敗したら戻す
    setByPart((prev) => ({
      ...prev,
      [selectedPart]: prev[selectedPart].map((ex) => (ex.id === id ? { ...ex, tier } : ex)),
    }));
    const res = await fetch(`/api/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    if (!res.ok) {
      setByPart((prev) => ({ ...prev, [selectedPart]: prevState }));
      alert("区分の変更に失敗しました");
    }
  };

  const deleteExercise = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？\n過去の記録は残ります。`)) return;
    const res = await fetch(`/api/exercises/${id}`, { method: "DELETE" });
    if (res.ok) {
      setByPart((prev) => ({
        ...prev,
        [selectedPart]: prev[selectedPart].filter((ex) => ex.id !== id),
      }));
    }
  };

  const addExercise = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        body_part: selectedPart,
        default_sets: newSets,
        target_weight_kg: newWeight,
        target_reps: newReps,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const newEx: ExercisePlan = {
        id: data.id,
        種目名: data.name,
        部位: data.body_part,
        目標重量kg: data.target_weight_kg,
        目標レップ数: data.target_reps,
        セット数: data.default_sets,
        ウォームアップセット数: data.warmup_sets ?? 0,
        tier: (data.tier ?? "core") as Tier,
        前回セット: [],
      };
      setByPart((prev) => ({
        ...prev,
        [selectedPart]: [...(prev[selectedPart] ?? []), newEx],
      }));
      setNewName("");
      setNewSets(3);
      setNewWeight(0);
      setNewReps(10);
      setShowAdd(false);
    }
    setSaving(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black text-white">
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-black border-b border-zinc-800 px-4 pt-safe-top pb-3">
        <div className="mt-2">
          <div className="text-xs text-zinc-500">種目・目標値</div>
          <div className="text-lg font-bold">管理</div>
        </div>
      </div>

      {/* 部位タブ */}
      <div className="flex-shrink-0 flex border-b border-zinc-800">
        {BODY_PARTS.map((part) => (
          <button
            key={part}
            onClick={() => { setSelectedPart(part); setEditingId(null); setShowAdd(false); }}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              selectedPart === part
                ? "text-white border-b-2 border-blue-500"
                : "text-zinc-500"
            }`}
          >
            {part}
          </button>
        ))}
      </div>

      {/* 種目リスト */}
      <div className="flex-1 min-h-0 overflow-y-scroll scrollbar-hide px-4 pt-3 pb-8 space-y-2">
        {loading && <div className="text-zinc-500 text-sm text-center py-8 animate-pulse">読み込み中...</div>}

        {exercises.map((ex) => (
          <div
            key={ex.id}
            className={`rounded-xl overflow-hidden ${
              ex.tier === "hold" ? "bg-zinc-900/40 border border-dashed border-zinc-800" : "bg-zinc-900"
            }`}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-sm truncate ${ex.tier === "hold" ? "text-zinc-500" : ""}`}>
                    {ex.種目名}
                  </span>
                  {ex.tier === "bonus" && (
                    <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">任意</span>
                  )}
                  {ex.tier === "hold" && (
                    <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">保留</span>
                  )}
                </div>
                <div className={`text-xs mt-0.5 ${ex.tier === "hold" ? "text-zinc-600" : "text-zinc-500"}`}>
                  {ex.目標重量kg > 0 ? `${ex.目標重量kg}kg` : "自重"} × {ex.目標レップ数}rep × {ex.セット数}set
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => editingId === ex.id ? setEditingId(null) : startEdit(ex)}
                  className="text-xs text-blue-400 bg-blue-900/30 px-2.5 py-1 rounded-lg"
                >
                  {editingId === ex.id ? "キャンセル" : "編集"}
                </button>
                <button
                  onClick={() => deleteExercise(ex.id, ex.種目名)}
                  className="text-xs text-red-400 bg-red-900/30 px-2.5 py-1 rounded-lg"
                >
                  削除
                </button>
              </div>
            </div>

            {editingId === ex.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
                {/* 区分（tier）— 保存ボタン不要で即時反映 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1.5">区分</div>
                  <div className="flex gap-1.5">
                    {TIERS.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => changeTier(ex.id, t.value)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                          ex.tier === t.value ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {TIERS.find((t) => t.value === ex.tier)?.hint}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">目標重量（kg）</div>
                    <input
                      type="number"
                      value={editState.target_weight_kg}
                      onChange={(e) => setEditState((s) => ({ ...s, target_weight_kg: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                      min={0}
                    />
                    <div className="text-xs text-zinc-600 mt-1 text-center">0=自重</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">目標レップ数</div>
                    <input
                      type="number"
                      value={editState.target_reps}
                      onChange={(e) => setEditState((s) => ({ ...s, target_reps: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                      min={1}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">セット数</div>
                    <input
                      type="number"
                      value={editState.default_sets}
                      onChange={(e) => setEditState((s) => ({ ...s, default_sets: Number(e.target.value) }))}
                      className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                      min={1}
                    />
                  </div>
                </div>
                <button
                  onClick={() => saveEdit(ex.id)}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 active:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            )}
          </div>
        ))}

        {/* 種目追加フォーム */}
        {showAdd ? (
          <div className="bg-zinc-900 rounded-xl px-4 py-4 space-y-3">
            <div className="text-sm font-semibold text-zinc-300">種目を追加</div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">種目名</div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例：チェストフライ"
                className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">目標重量（kg）</div>
                <input
                  type="number"
                  value={newWeight}
                  onChange={(e) => setNewWeight(Number(e.target.value))}
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                  min={0}
                />
                <div className="text-xs text-zinc-600 mt-1 text-center">0=自重</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">目標レップ数</div>
                <input
                  type="number"
                  value={newReps}
                  onChange={(e) => setNewReps(Number(e.target.value))}
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                  min={1}
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">セット数</div>
                <input
                  type="number"
                  value={newSets}
                  onChange={(e) => setNewSets(Number(e.target.value))}
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-center"
                  min={1}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm bg-zinc-800">キャンセル</button>
              <button
                onClick={addExercise}
                disabled={saving || !newName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 active:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "追加中..." : "追加"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full py-3.5 rounded-xl text-sm font-medium bg-zinc-900 text-blue-400 border border-zinc-800 border-dashed active:bg-zinc-800"
          >
            ＋ 種目を追加
          </button>
        )}
      </div>
    </div>
  );
}
