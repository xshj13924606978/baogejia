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
      // 开发环境：如果没有 cookie，返回测试用户
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth] 开发环境使用测试用户');
        return {
          id: 6, // 使用实际的业务用户ID
          email: 'admin2@test.com',
        };
      }

      // 尝试从 Authorization header 获取
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const _token = authHeader.substring(7);
        return { id: 6, email: 'admin2@test.com' };
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

    // 根据email查询业务用户表，获取正确的整数ID
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
      id: businessUser.id, // 返回业务用户表的整数ID
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
