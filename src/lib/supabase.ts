import { getServiceSupabase } from '@/lib/supabase-client';

// 获取 Supabase 客户端（服务端）
export function getSupabaseClient() {
  return getServiceSupabase();
}
