export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: originalId } = await params;

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();

    // 获取原对话
    const { data: original, error: fetchError } = await supabase
      .from('conversations')
      .select('title, user_id')
      .eq('id', originalId)
      .single();

    if (fetchError || !original) {
      console.error('[Conversations/[id]/reuse] 原对话不存在:', originalId);
      return NextResponse.json({ error: '原对话不存在' }, { status: 404 });
    }

    // 权限检查：非超管/管理员只能复用自己的对话
    if (user.role !== 'super_admin' && user.role !== 'admin' && original.user_id !== user.id) {
      console.error('[Conversations/[id]/reuse] 无权复用对话:', originalId);
      return NextResponse.json({ error: '无权复用' }, { status: 403 });
    }

    // 创建新对话
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title: `${original.title} (复用)`,
        user_id: user.id,
        last_message: '',
        status: 'active',
        message_count: 0,
        updated_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[Conversations/[id]/reuse] 创建新对话失败:', error);
      return NextResponse.json({ error: '创建失败' }, { status: 500 });
    }


    return NextResponse.json({
      conversation: {
        id: data.id,
        title: data.title,
        updatedAt: data.updated_at,
      },
      files: [],
    });
  } catch (error) {
    console.error('[Conversations/[id]/reuse] 复用异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
