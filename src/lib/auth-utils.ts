import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 测试用户 ID（用于开发环境）
const _TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

export async function getCurrentUser(request: NextRequest) {
  try {
    // 从 cookie 中获取会话
    const cookie = request.cookies.get('sb-access-token')?.value;
    let email = null;

    if (!cookie) {
      // 尝试从 Authorization header 获取 Supabase JWT token
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // 验证 Supabase JWT token
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);

        if (!error && user) {
          // token 有效，根据 email 查询业务用户
          email = user.email;
          const dbClient = getSupabaseClient();
          const { data: businessUser } = await dbClient
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

          if (businessUser) {
            return {
              id: businessUser.id,
              email: businessUser.email,
              name: user.user_metadata?.name || businessUser.email,
            };
          }
        }

        // 开发环境：token 无效时降级到测试用户
        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth] 开发环境：Bearer token 无效，降级使用测试用户');
          const dbClient = getSupabaseClient();
          const { data: businessUser } = await dbClient
            .from('users')
            .select('id, email')
            .eq('email', 'admin2@test.com')
            .single();

          if (businessUser) {
            return {
              id: businessUser.id,
              email: businessUser.email,
            };
          }
        }

        // 生产环境：token 无效直接返回 null
        return null;
      }

      // 无 cookie 也无 Bearer token
      // 开发环境降级到测试用户
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth] 开发环境使用测试用户');
        const dbClient = getSupabaseClient();
        const { data: businessUser } = await dbClient
          .from('users')
          .select('id, email')
          .eq('email', 'admin2@test.com')
          .single();

        if (businessUser) {
          return {
            id: businessUser.id,
            email: businessUser.email,
          };
        }
      }

      return null;
    }

    // 验证 Supabase 会话
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(cookie);

    if (error || !user) {
      return null;
    }

    email = user.email;

    // 根据email查询业务用户表，获取正确的ID
    const dbClient = getSupabaseClient();
    const { data: businessUser } = await dbClient
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (!businessUser) {
      console.error('[Auth] 未找到业务用户:', email);
      return null;
    }

    return {
      id: businessUser.id, // 返回业务用户表的ID
      email: businessUser.email,
      name: user.user_metadata?.name || businessUser.email,
    };
  } catch (error) {
    console.error('[Auth] 获取用户失败:', error);
    return null;
  }
}

// 用于客户端的 hook
export function getClientUser() {
  if (typeof window === 'undefined') return null;

  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    console.error('[Auth] 解析用户数据失败:', e);
  }
  return null;
}
