export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { Logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth-utils';

/**
 * PATCH /api/messages/:id — 编辑消息内容
 * 前端 chat-area.tsx handleEditMessage 调用
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;
  Logger.info('[Messages:id] PATCH 编辑消息', { id: messageId });

  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { content } = body;

    if (!messageId || content === undefined) {
      Logger.error('[Messages:id] 缺少必要参数', { messageId, hasContent: content !== undefined });
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // 查找消息，获取所属对话 ID 用于权限校验
    const { data: message, error: findError } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .eq('id', messageId)
      .single();

    if (findError || !message) {
      Logger.error('[Messages:id] 消息未找到', { messageId, error: findError?.message });
      return NextResponse.json({ error: '消息未找到' }, { status: 404 });
    }

    // 权限检查：通过对话归属校验
    const { data: conversation } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', message.conversation_id)
      .single();

    if (conversation && conversation.user_id !== user.id && user.role !== 'super_admin' && user.role !== 'admin') {
      Logger.error('[Messages:id] 无权编辑此消息', { messageId, userId: user.id });
      return NextResponse.json({ error: '无权操作' }, { status: 403 });
    }

    // 更新消息内容
    const { data, error } = await supabase
      .from('messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      Logger.error('[Messages:id] 编辑失败', error);
      return NextResponse.json({ error: '编辑失败', details: error.message }, { status: 500 });
    }

    Logger.info('[Messages:id] 编辑成功', { messageId });
    return NextResponse.json({ success: true, message: data });
  } catch (error) {
    Logger.error('[Messages:id] 异常', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
