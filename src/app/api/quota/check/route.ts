import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 检查用户是否有可用配额
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const { data: user, error } = await db
      .from('users')
      .select('*')
      .eq('id', parseInt(userId))
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // VIP用户无限次
    if (user.role === 'vip') {
      const expireDate = new Date(user.expire_date);
      const now = new Date();

      if (expireDate < now) {
        // VIP已过期
        return NextResponse.json({
          success: false,
          allowed: false,
          reason: 'VIP已过期',
          quota_used: user.quota_used,
          quota_total: user.quota_total,
        });
      }

      return NextResponse.json({
        success: true,
        allowed: true,
        unlimited: true,
        expire_date: user.expire_date,
      });
    }

    // 检查普通用户配额
    const available = user.quota_total - user.quota_used;

    return NextResponse.json({
      success: true,
      allowed: available > 0,
      quota_used: user.quota_used,
      quota_total: user.quota_total,
      available: Math.max(0, available),
    });
  } catch (error) {
    console.error('[Quota] 检查配额失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 扣减配额
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, count = 1 } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 先检查是否有足够配额
    const { data: user, error } = await db
      .from('users')
      .select('*')
      .eq('id', parseInt(user_id))
      .single();

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // VIP用户不扣减配额
    if (user.role === 'vip') {
      return NextResponse.json({
        success: true,
        message: 'VIP用户，配额不限',
      });
    }

    // 检查配额是否足够
    const available = user.quota_total - user.quota_used;
    if (available < count) {
      return NextResponse.json(
        {
          error: '配额不足',
          quota_used: user.quota_used,
          quota_total: user.quota_total,
          available: Math.max(0, available),
        },
        { status: 429 }
      );
    }

    // 扣减配额
    const { data: updatedUser, error: updateError } = await db
      .from('users')
      .update({
        quota_used: user.quota_used + count,
      })
      .eq('id', parseInt(user_id))
      .select()
      .single();

    if (updateError || !updatedUser) {
      return NextResponse.json({ error: '扣减配额失败' }, { status: 500 });
    }

    // 更新localStorage中的用户信息
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      userData.quota_used = updatedUser.quota_used;
      localStorage.setItem('user', JSON.stringify(userData));
    }

    return NextResponse.json({
      success: true,
      message: '配额扣减成功',
      quota_used: updatedUser.quota_used,
      quota_total: updatedUser.quota_total,
      available: updatedUser.quota_total - updatedUser.quota_used,
    });
  } catch (error) {
    console.error('[Quota] 扣减配额失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
