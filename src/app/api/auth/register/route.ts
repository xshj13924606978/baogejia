import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { POST as awardPoints } from '../../points/route';

// 注册用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, email, phone, role, company, contact } = body;

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 检查用户名是否已存在
    const { data: existingUser, error: checkError } = await db
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    // 创建用户
    const { data: user, error: createError } = await db
      .from('users')
      .insert({
        username,
        password, // 实际应用中应该加密
        email,
        phone,
        role: role || 'pending', // 默认为待审核
        status: 'active',
        points: 0,
        total_points: 0,
        company,
        contact,
        verified: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError || !user) {
      console.error('[Auth] 注册失败:', createError);
      return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }

    // 注册成功后奖励积分
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          type: 'register',
          description: '注册账号奖励',
        }),
      });
    } catch (pointsError) {
      console.error('[Auth] 注册积分奖励失败:', pointsError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        points: user.points,
        total_points: user.total_points,
      },
      message: '注册成功，请等待审核',
    });
  } catch (error) {
    console.error('[Auth] 注册请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
