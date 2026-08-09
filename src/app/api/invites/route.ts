export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { POST as _awardPoints } from '../points/route';

// 创建邀请链接
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';
    const fallbackInviteCode = `INVITE${user_id}${Date.now().toString(36)}`;
    const fallbackInviteLink = `${appUrl}/register?code=${fallbackInviteCode}`;

    // 检查是否已有邀请码
    const { data: existingInvite, error: existingError } = await db
      .from('invites')
      .select('invite_code')
      .eq('user_id', user_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingError) {
      // 表不存在时直接返回生成的邀请码，保证前端可以分享
      if (existingError.code === '42P01' || existingError.code === 'PGRST205') {
        return NextResponse.json({
          success: true,
          inviteLink: fallbackInviteLink,
          inviteCode: fallbackInviteCode});
      }
      console.error('[Invite] 查询已有邀请码失败:', existingError);
    }

    if (existingInvite) {
      return NextResponse.json({
        success: true,
        inviteLink: `${appUrl}/register?code=${existingInvite.invite_code}`,
        inviteCode: existingInvite.invite_code});
    }

    // 生成新的邀请码
    const inviteCode = fallbackInviteCode;

    // 创建邀请记录
    const { data: invite, error } = await db
      .from('invites')
      .insert({
        user_id,
        invite_code: inviteCode,
        status: 'pending'})
      .select()
      .single();

    if (error) {
      // 表不存在时直接返回生成的邀请码，保证前端可以分享
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({
          success: true,
          inviteLink: fallbackInviteLink,
          inviteCode: inviteCode});
      }
      console.error('[Invite] 创建邀请失败:', error);
      return NextResponse.json({ error: '创建邀请失败' }, { status: 500 });
    }

    if (!invite) {
      console.error('[Invite] 创建邀请后未返回数据');
      return NextResponse.json({ error: '创建邀请失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inviteLink: `${appUrl}/register?code=${inviteCode}`,
      inviteCode: invite.invite_code});
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

    const db = getSupabaseServiceClient();

    // 获取邀请列表
    const { data: invites, error } = await db
      .from('invites')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // 表不存在时优雅降级，返回空数据
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({
          success: true,
          stats: { total: 0, registered: 0, points: 0 },
          invites: [],
        });
      }
      console.error('[Invite] 查询失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    // 统计
    const total = invites?.length || 0;
    const registered = invites?.filter((i) => i.status === 'registered').length || 0;
    const points = invites?.reduce((sum, i) => sum + (i.points_awarded || 0), 0) || 0;

    // 获取最新的邀请码（表不存在时优雅降级）
    const { data: latestInvite, error: latestError } = await db
      .from('invites')
      .select('invite_code')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (latestError && latestError.code !== '42P01' && latestError.code !== 'PGRST205') {
      console.error('[Invite] 获取最新邀请码失败:', latestError);
    }

    return NextResponse.json({
      success: true,
      stats: {
        total,
        registered,
        points},
      invites: invites || [],
      inviteCode: latestInvite?.invite_code});
  } catch (error) {
    console.error('[Invite] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
