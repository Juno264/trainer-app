import { createClient } from "@supabase/supabase-js";

// このクライアントはサーバー（app/api/**/route.ts）からのみ利用する。
// service_role キーは RLS をバイパスする管理者キーのため、
// 絶対に NEXT_PUBLIC_ を付けず、クライアントコンポーネントから import しないこと。
// 未設定の環境では anon キーにフォールバックする（RLS 有効化前の後方互換）。
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY!
);
