import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 获取当前用户身份
 *
 * 认证优先级（从高到低）：
 * 1. Supabase cookie (sb-access-token)  — OAuth 登录
 * 2. Authorization Bearer token           — Supabase JWT
 * 3. x-user-id header                    — 本地登录方式（从 localStorage.user.id 传入）
 * 4. 开发环境降级                         — 仅 NODE_ENV=development 时生效，避免影响生产环境
 */
export async function getCurrentUser(request: NextRequest) {
  try {
    // 优先级1: Supabase cookie
    const cookie = request.cookies.get('sb-access-token')?.value;
    if (cookie) {
      const { data: { user }, error } = await supabase.auth.getUser(cookie);
      if (!error && user) {
        const dbClient = getSupabaseClient();
        const { data: businessUser } = await dbClient
          .from('users').select('id, email, role').eq('email', user.email).single();
        if (businessUser) {
          return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'admin', name: user.user_metadata?.name || businessUser.email };
        }
      }
    }

    // 优先级2: Authorization Bearer token
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        const dbClient = getSupabaseClient();
        const { data: businessUser } = await dbClient
          .from('users').select('id, email, role').eq('email', user.email).single();
        if (businessUser) {
          return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'admin', name: user.user_metadata?.name || businessUser.email };
        }
      }
    }

    // 优先级3: x-user-id header（本地登录方式，前端从 localStorage.user.id 传入）
    const xUserId = request.headers.get('x-user-id');
    if (xUserId) {
      const dbClient = getSupabaseClient();
      const { data: businessUser } = await dbClient
        .from('users').select('id, email, role').eq('id', xUserId).single();
      if (businessUser) {
        return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'user', name: businessUser.email };
      }
    }

    // 优先级4: 开发环境降级（保持向后兼容，避免影响其他未传 header 的 API）
    if (process.env.NODE_ENV === 'development') {
      const dbClient = getSupabaseClient();
      const { data: businessUser } = await dbClient
        .from('users').select('id, email, role').eq('email', 'admin2@test.com').single();
      if (businessUser) {
        return { id: businessUser.id, email: businessUser.email, role: businessUser.role || 'admin' };
      }
    }

    return null;
  } catch (error) {
    console.error('[Auth] 获取用户失败:', error);
    return null;
  }
}

// 用于客户端的 hook（已迁移到 client-utils.ts）
export function getClientUser() {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr);
  } catch (e) {
    console.error('[Auth] 解析用户数据失败:', e);
  }
  return null;
}
