<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# trainer_app — パーソナルトレーニング記録PWA

個人用の筋トレ記録アプリ。iPhoneにPWAとしてインストールして使う。
会話は**日本語**で行うこと。

## 🔴 セキュリティ制約（最優先・必ず守る）

- **このGitHubリポジトリは公開されている。** APIキー・トークン・接続文字列を
  コードやドキュメントに書き込むことは絶対に禁止。`.env*` は `.gitignore` 済み。
- **`SUPABASE_SERVICE_ROLE_KEY` はRLSを完全にバイパスする最上位の鍵。**
  `NEXT_PUBLIC_` を絶対に付けない。クライアントコンポーネントから
  `app/lib/supabase.ts` を import しない（サーバー専用）。
- 全テーブルで **RLS有効・ポリシーなし**。anonキーは全拒否され、
  service_role のサーバーAPIだけが通る構成。ポリシーを追加する必要はない。

## デプロイ

| 項目 | 値 |
|---|---|
| 本番URL | https://trainerapp-theta.vercel.app |
| ホスティング | Vercel（`master` へのpushで自動デプロイ） |
| DB | Supabase（プロジェクト名 `trainer-app`, ap-northeast-1） |
| AI | Anthropic API（`@anthropic-ai/sdk`） |

**ローカルにNode.jsが入っていない。** `npm run dev` も `tsc` も実行できないため、
型エラーはVercelのビルドで初めて判明する。変更後は型の整合を目視で入念に確認すること。

## アーキテクチャ

### 画面構成（`app/page.tsx`）
```
type AppTab = "home" | "train" | "history" | "manage"   ← BottomTabBarで常時表示
type Overlay = "custom" | "training" | "review" | null  ← タブの上に全画面表示
```
`overlay !== null` のときタブバーは非表示。

| コンポーネント | 役割 |
|---|---|
| `HomeTab` | 部位別回復ステータス＋おすすめ＋今すぐ開始 |
| `TrainTab` | 部位選択＋カスタム編集への導線 |
| `HistoryView` | 記録／グラフ／カレンダーの3内部タブ＋週次AIサマリー |
| `ExerciseManageView` | 種目のCRUD |
| `TrainingView` | セット入力・タイマー・RPE・メモ（全画面オーバーレイ） |
| `CustomEditView` | 種目の選択と長押しドラッグ並び替え |
| `StatsChart` | 純SVG折れ線グラフ（外部ライブラリ不使用） |

### APIルート（すべて `app/api/*/route.ts`）
`recommend` `exercises` `exercises/[id]` `complete` `history` `stats` `calendar`
`weekly-summary` `keepalive`

### DBスキーマ（Supabase）
- `body_parts` — 部位・回復時間・最終実施日
- `exercises` — 種目マスタ（目標重量/レップ/セット数/`warmup_sets`/`tier`）
- `training_records` — 全セット記録（重量・レップ・達成・RPE・体調・メモ）
- `reviews` — AI分析（`review_json` に構造化レビュー＋達成率の内訳）

### 種目の区分（`exercises.tier`）— 達成率の根幹

| tier | 意味 | 画面表示 | 達成率の分母 |
|---|---|---|---|
| `core` | 必須種目 | 出す | **含む** |
| `bonus` | 任意。余力があれば | 出す（「任意」バッジ＋点線枠） | 含まない（加点として別カウント） |
| `hold` | 保留中。今はやらない | **出さない**（管理画面のみ） | 含まない |

- **tier をハードコードしないこと。** AI側が状況に応じて更新するため必ずDBから読む。
- hold の除外は `app/lib/session.ts` の `activeExercises()` を使う。
- 管理画面（`ExerciseManageView`）だけは hold も表示し、区分を変更できる。

### 負荷タイプ（`exercises.load_type`）と重量の符号

| load_type | 実効負荷 | 重量kg の意味 |
|---|---|---|
| `external` | 重量kg | バーベル/マシンの重量 |
| `bodyweight` | 体重 + 重量kg | 負=アシスト（`-40`＝40kgアシスト）／正=加重／0=純自重 |

- **アシストは必ず負で持つ。** 正の数にすると、アシストが減る＝成長したときに
  グラフが右肩下がりになってしまう。
- 体重は `app_settings` の `body_weight_kg`（`/api/settings`）。自重種目の
  推定1RMに必要。**負の重量を `Math.max(0, ...)` で潰さないこと。**
- 重量の表示・計算は `app/lib/load.ts` に集約（`formatWeight` / `effectiveLoad` /
  `estimate1RM` / `rawFromEffective`）。UIで直に `重量 > 0 ? ... : "自重"` と書かない。
- ウォームアップ生成は**実効負荷ベース**で計算する。生の重量に係数を掛けると
  アシスト種目でアシストが減り、本番より重いウォームアップになる。
- 2026-06-06以前の自重種目の記録は、アシストを正の数で入れていた時期があり
  推定1RMが過大に出る。**意図的に修正していない**ので、そういうものとして扱う。

## 運用上の重要な注意

- **Supabase無料プランは1週間アクセスがないと自動停止する。**
  `vercel.json` の cron で毎日 `/api/keepalive` を叩いて防いでいる。
  もし全APIが `[object Object]` エラーを返したら、まずプロジェクトの停止を疑う
  （Supabaseダッシュボードから Restore が必要）。
- **iOS PWA対応**：`h-screen` ではなく `fixed inset-0`、
  `overflow-y-auto` ではなく `overflow-y-scroll` を使う（iOSで動かないため）。
- **`recharts` は使わない**（過去にpackage.json未追加でビルドが壊れた）。
  グラフは `StatsChart.tsx` の純SVG実装。
- 推定1RMは Epley式 `weight × (1 + reps/30)`。その日の全セット中の最大値を採用。

## AI分析の設計方針（`app/api/complete/route.ts`）

単なる目標値と実績の数値比較ではなく、**人間のトレーナーのように**振る舞わせる。
プロンプトを変更する際は以下を壊さないこと：

1. 過去4週の全セッション履歴と直近レビューを文脈として渡す
2. メモ欄の内容を必ず分析に反映する
3. 種目の実施順を見て、後半種目の未達は「疲労」と判断する（安易に重量を下げない）
4. 3週連続で未達なら「目標が高すぎる」と提案する
5. 肯定から入り、改善点は1つに絞り、励ましで締める
6. 自重種目（目標重量0）のレップ数を1未満にしない（過去に `-2` に壊れた事故あり）
7. 任意（bonus）種目が未実施でも責めない

### 達成率と自動重量調整（壊してはいけない不変条件）

- **達成率はコードで算出する。Claudeに生成させない。**
  分母は core 種目の `default_sets` 合計（実記録数ではなく予定数）。
  これにより種目を丸ごと飛ばしても正しく未達として反映される。
  予定超過分は加算せず上限100%。`reviews.achievement_rate` には必須達成率のみ保存。
- **自動重量調整は「実施した core 種目」に限る。**
  記録が0件の種目まで調整対象にしていたため、未実施の種目の目標重量が
  セッションのたびに下がり続ける不具合があった（脚・お尻が57.5kgまで低下）。
  「記録がない」と「実施したが未達」は別物で、前者はシグナルが存在しない。
  全0rep（種目を開いただけ）も記録なしと同等に扱う。
- 2026-07-25 より前の `achievement_rate` は旧ロジックの値。再計算はしないため、
  グラフで推移を出すときは境界として扱うこと。

## コーディング規約

- コミットメッセージは日本語。末尾に `Co-Authored-By: Claude <noreply@anthropic.com>`
- 型定義は `app/lib/types.ts` に集約（日本語プロパティ名を使用）
- セッション生成ロジックは `app/lib/session.ts`（`buildSets` / `makeExerciseState`）
