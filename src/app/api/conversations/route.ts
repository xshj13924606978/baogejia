export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser, requireAuth } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {

  try {
    const user = await getCurrentUser(request);
    if (!user) {
      console.error('[Conversations] 用户未认证');
      return NextResponse.json({ conversations: [] });
    }

    const supabase = getSupabaseServiceClient();

    let query = supabase
      .from('conversations')
      .select('*');

    // 根据用户角色过滤对话
    if (user.role === 'super_admin' || user.role === 'admin') {
      // 超管和管理员：查看所有对话
    } else {
      // 普通用户：只查看自己的对话
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      console.error('[Conversations] 查询失败:', error);
      return NextResponse.json({ conversations: [] });
    }

    const conversations = (data || []).map((conv) => ({
      id: conv.id,
      title: conv.title || '新对话',
      updatedAt: conv.updated_at,
      createdAt: conv.created_at,
      lastMessage: conv.last_message || ''}));

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('[Conversations] 异常:', error);
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST(request: NextRequest) {

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) {
      console.error('[Conversations] 认证失败:', errorResponse.status);
      return errorResponse;
    }

    const supabase = getSupabaseServiceClient();

    let title = '新对话';
    try {
      const body = await request.json();
      title = body.title || '新对话';
    } catch {
      // title 解析失败时使用默认值
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title: title,
        user_id: user.id,
        last_message: '',
        status: 'active',
        updated_at: now,
        created_at: now})
      .select()
      .single();

    if (error) {
      console.error('[Conversations] 插入失败:', error);
      return NextResponse.json({ error: '创建失败' }, { status: 500 });
    }


    return NextResponse.json({
      conversation: {
        id: data.id,
        title: data.title,
        updatedAt: data.updated_at,
        createdAt: data.created_at,
        lastMessage: ''}});
  } catch (error) {
    console.error('[Conversations] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // 只有超管可以清空所有对话
    if (user.role !== 'super_admin') {
      console.error('[Conversations] 权限不足，非超管尝试清空对话');
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const supabase = getSupabaseServiceClient();

    const { error } = await supabase.from('conversations').delete().not('id', 'is', null);

    if (error) {
      console.error('[Conversations] 清空失败:', error);
      return NextResponse.json({ error: '清空失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Conversations] 清空异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
