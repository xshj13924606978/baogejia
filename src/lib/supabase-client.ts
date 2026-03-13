import { createClient } from '@supabase/supabase-js';

// 客户端使用的配置（只使用匿名密钥）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 创建客户端实例（用于浏览器）
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 创建服务端实例（用于 API 路由，使用服务角色密钥）
export const getServiceSupabase = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
