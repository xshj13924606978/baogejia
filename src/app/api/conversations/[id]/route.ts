import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[Conversations/[id]] GET 请求，ID:', id);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 获取对话基本信息
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (convError || !conversation) {
      console.error('[Conversations/[id]] 查询失败:', convError);
      return NextResponse.json({ error: '对话不存在' }, { status: 404 });
    }

    // 获取对话的消息 - 确保按时间排序
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('[Conversations/[id]] 获取消息失败:', msgError);
    }

    console.log('[Conversations/[id]] 获取到消息数量:', messages?.length || 0);

    // 格式化消息，确保包含文件数据
    const formattedMessages = (messages || []).map((msg) => {
      // 确保文件数据是数组
      const fileData = msg.file_data || [];

      // 如果有文件数据，打印日志
      if (fileData.length > 0) {
        console.log(`[Conversations/[id]] 消息 ${msg.id} 包含 ${fileData.length} 个文件`);
      }

      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        quote_data: msg.quote_data,
        file_data: fileData,
      };
    });

    // 获取对话的文件
    const { data: files, error: filesError } = await supabase
      .from('conversation_files')
      .select('*')
      .eq('conversation_id', id);

    if (filesError) {
      console.error('[Conversations/[id]] 获取文件失败:', filesError);
    }

    console.log('[Conversations/[id]] 总文件数:', files?.length || 0);

    // 构建返回数据
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title || '新对话',
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        lastMessage: conversation.last_message || '',
        messages: formattedMessages,
        files: files || [],
        messageCount: messages?.length || 0,
        fileCount: files?.length || 0,
      },
    });
  } catch (error) {
    console.error('[Conversations/[id]] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[Conversations/[id]] PATCH 请求，ID:', id);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const body = await request.json();
    const { title } = body;

    if (!title) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Conversations/[id]] 更新失败:', error);
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    return NextResponse.json({
      conversation: {
        id: data.id,
        title: data.title,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error('[Conversations/[id]] 更新异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('[Conversations/[id]] DELETE 请求，ID:', id);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 先删除相关的消息记录
    await supabase.from('messages').delete().eq('conversation_id', id);

    // 再删除相关的文件记录
    await supabase.from('conversation_files').delete().eq('conversation_id', id);

    // 最后删除对话
    const { error } = await supabase.from('conversations').delete().eq('id', id);

    if (error) {
      console.error('[Conversations/[id]] 删除失败:', error);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Conversations/[id]] 删除异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
