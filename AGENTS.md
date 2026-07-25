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
- `exercises` — 種目マスタ（目標重量/レップ/セット数/`warmup_sets`）
- `training_records` — 全セット記録（重量・レップ・達成・RPE・体調・メモ）
- `reviews` — AI分析（`review_json` に構造化レビュー）

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

## コーディング規約

- コミットメッセージは日本語。末尾に `Co-Authored-By: Claude <noreply@anthropic.com>`
- 型定義は `app/lib/types.ts` に集約（日本語プロパティ名を使用）
- セッション生成ロジックは `app/lib/session.ts`（`buildSets` / `makeExerciseState`）
