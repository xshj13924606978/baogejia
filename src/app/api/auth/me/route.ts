import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取当前用户信息
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const db = getSupabaseClient();

    // 查询用户
    const { data: user, error } = await db
      .from('users')
      .select('*')
      .eq('id', parseInt(userId))
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        points: user.points,
        total_points: user.total_points,
        company: user.company,
        contact: user.contact,
        verified: user.verified,
        quota_used: user.quota_used,
        quota_total: user.quota_total,
        expire_date: user.expire_date,
      }
    });
  } catch (error) {
    console.error('[Auth] 获取用户信息失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
