import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  console.log('[Conversations] GET 所有对话');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 简化查询，不关联其他表
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Conversations] 查询失败:', error);
      return NextResponse.json({ conversations: [] });
    }

    const conversations = (data || []).map((conv) => ({
      id: conv.id,
      title: conv.title || '新对话',
      updatedAt: conv.updated_at,
      createdAt: conv.created_at,
      lastMessage: conv.last_message || '',
    }));

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('[Conversations] 异常:', error);
    return NextResponse.json({ conversations: [] });
  }
}

export async function POST(request: NextRequest) {
  console.log('[Conversations] POST 创建新对话');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let title = '新对话';
    try {
      const body = await request.json();
      title = body.title || '新对话';
    } catch (e) {}

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title: title,
        last_message: '',
        status: 'active',
        updated_at: now,
        created_at: now,
      })
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
        lastMessage: '',
      },
    });
  } catch (error) {
    console.error('[Conversations] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
