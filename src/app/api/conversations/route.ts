import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    const { data, error } = await db
      .from('conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const conversations = data.map((conv: any) => ({
      id: conv.id,
      title: conv.title,
      updatedAt: conv.updated_at,
    }));

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Failed to load conversations:', error);
    return NextResponse.json(
      { error: 'Failed to load conversations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const { title } = await request.json();

    const now = new Date().toISOString();

    const { data, error } = await db
      .from('conversations')
      .insert({
        title: title || '新对话',
        messages: [],
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    // 删除所有对话
    const { error } = await db
      .from('conversations')
      .delete()
      .neq('id', 0); // 使用一个总是为真的条件来删除所有记录

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear all conversations:', error);
    return NextResponse.json(
      { error: 'Failed to clear all conversations' },
      { status: 500 }
    );
  }
}
