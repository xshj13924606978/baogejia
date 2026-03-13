import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: originalId } = await params;
  console.log('[Conversations/[id]/reuse] POST 请求，原ID:', originalId);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 获取原对话
    const { data: original, error: fetchError } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', originalId)
      .single();

    if (fetchError || !original) {
      console.error('[Conversations/[id]/reuse] 原对话不存在:', originalId);
      return NextResponse.json({ error: '原对话不存在' }, { status: 404 });
    }

    // 创建新对话
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title: `${original.title} (复用)`,
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

    console.log('[Conversations/[id]/reuse] 复用成功, 新ID:', data.id);

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
