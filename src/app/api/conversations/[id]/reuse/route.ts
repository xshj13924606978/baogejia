import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getSupabaseClient();
    const params = await context.params;
    const id = parseInt(params.id);

    // 获取原对话
    const { data: originalConv, error: fetchError } = await db
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !originalConv) {
      throw fetchError || new Error('Conversation not found');
    }

    // 创建新对话，复制消息
    const now = new Date().toISOString();
    const { data: newConv, error: createError } = await db
      .from('conversations')
      .insert({
        title: `复用: ${originalConv.title}`,
        messages: originalConv.messages,
        customer_id: originalConv.customer_id,
        quote_id: originalConv.quote_id,
        updated_at: now,
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return NextResponse.json({ newConversationId: newConv.id });
  } catch (error) {
    console.error('Failed to reuse conversation:', error);
    return NextResponse.json(
      { error: 'Failed to reuse conversation' },
      { status: 500 }
    );
  }
}
