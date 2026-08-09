export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

// 生成邀请码
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { user_id, type = 'link' } = body;

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 生成唯一的邀请码
    const code = `INVITE${user_id}${Date.now().toString(36)}`;

    // 创建邀请码记录
    const { data, error } = await db
      .from('invite_codes')
      .insert({
        user_id,
        code,
        type,
        expire_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[InviteCode] 生成邀请码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 获取用户邀请码列表
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('invite_codes')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      // 表不存在时优雅降级，返回空数据
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, data: [] });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('[InviteCode] 获取邀请码列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 验证邀请码
export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ error: '缺少邀请码' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 查找邀请码
    const { data: inviteCode, error: codeError } = await db
      .from('invite_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (codeError || !inviteCode) {
      return NextResponse.json({ error: '邀请码无效' }, { status: 404 });
    }

    // 检查是否过期
    if (inviteCode.expire_date && new Date(inviteCode.expire_date) < new Date()) {
      return NextResponse.json({ error: '邀请码已过期' }, { status: 400 });
    }

    // 增加扫描次数
    await db
      .from('invite_codes')
      .update({ scan_count: (inviteCode.scan_count || 0) + 1 })
      .eq('id', inviteCode.id);

    return NextResponse.json({
      success: true,
      data: {
        code: inviteCode.code,
        user_id: inviteCode.user_id,
        valid: true,
      },
    });
  } catch (error) {
    console.error('[InviteCode] 验证邀请码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
