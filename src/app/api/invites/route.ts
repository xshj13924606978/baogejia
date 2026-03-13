import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { POST as awardPoints } from '../points/route';

// 创建邀请链接
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 检查是否已有邀请码
    const { data: existingInvite } = await db
      .from('invites')
      .select('invite_code')
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json({
        success: true,
        inviteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/register?code=${existingInvite.invite_code}`,
        inviteCode: existingInvite.invite_code,
      });
    }

    // 生成新的邀请码
    const inviteCode = `INVITE${user_id}${Date.now().toString(36)}`;

    // 创建邀请记录
    const { data: invite, error } = await db
      .from('invites')
      .insert({
        user_id,
        invite_code: inviteCode,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !invite) {
      console.error('[Invite] 创建邀请失败:', error);
      return NextResponse.json({ error: '创建邀请失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inviteLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/register?code=${inviteCode}`,
      inviteCode: invite.invite_code,
    });
  } catch (error) {
    console.error('[Invite] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 获取邀请列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 获取邀请列表
    const { data: invites, error } = await db
      .from('invites')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Invite] 查询失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 统计
    const total = invites?.length || 0;
    const registered = invites?.filter((i) => i.status === 'registered').length || 0;
    const points = invites?.reduce((sum, i) => sum + (i.points_awarded || 0), 0) || 0;

    // 获取最新的邀请码
    const { data: latestInvite } = await db
      .from('invites')
      .select('invite_code')
      .eq('user_id', parseInt(user_id))
      .order('created_at', { ascending: false })
      .maybeSingle();

    return NextResponse.json({
      success: true,
      stats: {
        total,
        registered,
        points,
      },
      invites: invites || [],
      inviteCode: latestInvite?.invite_code,
    });
  } catch (error) {
    console.error('[Invite] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
